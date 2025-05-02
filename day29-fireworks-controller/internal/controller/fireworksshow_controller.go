/*
Copyright 2025.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package controller

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	fireworksv1alpha1 "github.com/lirlia/100day_challenge_backend/day29_fireworks_controller/api/v1alpha1"
)

const (
	PhasePending   = "Pending"
	PhaseRunning   = "Running"
	PhaseCompleted = "Completed"
	PhaseFailed    = "Failed"

	requeueInterval = 1 * time.Second
)

// FireworksShowReconciler reconciles a FireworksShow object
type FireworksShowReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	// Store last launch time per show to control intensity
	lastLaunchTimes map[types.NamespacedName]time.Time
}

// +kubebuilder:rbac:groups=fireworks.example.com,resources=fireworksshows,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=fireworks.example.com,resources=fireworksshows/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=fireworks.example.com,resources=fireworksshows/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=pods,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// TODO(user): Modify the Reconcile function to compare the state specified by
// the FireworksShow object against the actual cluster state, and then
// perform operations to make the cluster state reflect the state specified by
// the user.
//
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.20.4/pkg/reconcile
func (r *FireworksShowReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Reconciling FireworksShow", "request", req.NamespacedName)

	if r.lastLaunchTimes == nil {
		r.lastLaunchTimes = make(map[types.NamespacedName]time.Time)
	}

	// Fetch the FireworksShow instance
	show := &fireworksv1alpha1.FireworksShow{}
	if err := r.Get(ctx, req.NamespacedName, show); err != nil {
		if apierrors.IsNotFound(err) {
			log.Info("FireworksShow resource not found. Ignoring since object must be deleted")
			delete(r.lastLaunchTimes, req.NamespacedName) // Clean up map entry
			return ctrl.Result{}, nil
		}
		log.Error(err, "Failed to get FireworksShow")
		return ctrl.Result{}, err
	}

	// Initialize status if it's the first reconcile
	if show.Status.Phase == "" {
		log.Info("Initializing FireworksShow status", "show", req.NamespacedName)
		now := metav1.Now()
		endTime := metav1.NewTime(now.Add(time.Duration(show.Spec.DurationSeconds) * time.Second))
		show.Status = fireworksv1alpha1.FireworksShowStatus{
			Phase:             PhasePending,
			StartTime:         &now,
			EndTime:           &endTime,
			LaunchedPodsCount: 0,
			ActivePodsCount:   0,
			Conditions:        []metav1.Condition{},
		}
		if err := r.Status().Update(ctx, show); err != nil {
			log.Error(err, "Failed to initialize FireworksShow status")
			return ctrl.Result{}, err
		}
		r.Recorder.Event(show, corev1.EventTypeNormal, "Initialized", "FireworksShow initialized")
		r.lastLaunchTimes[req.NamespacedName] = time.Time{} // Initialize last launch time
		return ctrl.Result{Requeue: true}, nil              // Requeue to start processing
	}

	// Handle different phases
	switch show.Status.Phase {
	case PhasePending:
		log.Info("FireworksShow is Pending, transitioning to Running", "show", req.NamespacedName)
		show.Status.Phase = PhaseRunning
		if err := r.Status().Update(ctx, show); err != nil {
			log.Error(err, "Failed to update status to Running")
			return ctrl.Result{}, err
		}
		r.Recorder.Event(show, corev1.EventTypeNormal, "Started", "FireworksShow started")
		return ctrl.Result{RequeueAfter: requeueInterval}, nil

	case PhaseRunning:
		log.V(1).Info("FireworksShow is Running", "show", req.NamespacedName)
		now := time.Now()

		// Check if the show duration has ended
		if show.Status.EndTime != nil && now.After(show.Status.EndTime.Time) {
			log.Info("FireworksShow duration ended", "show", req.NamespacedName)
			show.Status.Phase = PhaseCompleted
			if err := r.Status().Update(ctx, show); err != nil {
				log.Error(err, "Failed to update status to Completed")
				return ctrl.Result{}, err
			}
			r.Recorder.Event(show, corev1.EventTypeNormal, "Completed", "FireworksShow completed")
			delete(r.lastLaunchTimes, req.NamespacedName) // Clean up map entry
			return ctrl.Result{}, nil
		}

		// Launch new pods based on intensity
		lastLaunch, _ := r.lastLaunchTimes[req.NamespacedName]
		// Calculate how many pods should have been launched since the last check
		expectedLaunches := int32(now.Sub(lastLaunch).Seconds() * float64(show.Spec.Intensity))

		podsLaunchedThisCycle := int32(0)
		for i := int32(0); i < expectedLaunches && podsLaunchedThisCycle < show.Spec.Intensity; i++ {
			pod, err := r.createFireworksPod(ctx, show)
			if err != nil {
				log.Error(err, "Failed to create firework pod", "show", req.NamespacedName)
				r.Recorder.Eventf(show, corev1.EventTypeWarning, "PodCreationFailed", "Failed to create pod: %v", err)
				// Optionally: transition to Failed phase on persistent errors
				// show.Status.Phase = PhaseFailed
				// r.Status().Update(ctx, show)
				// return ctrl.Result{}, err // Stop reconciling on critical error
				continue // Try next pod if possible
			}
			log.V(1).Info("Launched firework pod", "pod", pod.Name, "show", req.NamespacedName)
			r.Recorder.Eventf(show, corev1.EventTypeNormal, "PodLaunched", "Launched pod %s", pod.Name)
			show.Status.LaunchedPodsCount++
			podsLaunchedThisCycle++
		}

		if podsLaunchedThisCycle > 0 {
			r.lastLaunchTimes[req.NamespacedName] = now // Update last launch time only if pods were launched
		}

		// Update active pod count
		activePods, err := r.getActivePods(ctx, show)
		if err != nil {
			log.Error(err, "Failed to get active pods", "show", req.NamespacedName)
			// Don't block reconciliation, just log the error
		} else {
			show.Status.ActivePodsCount = int32(len(activePods))
		}

		// Update status
		if err := r.Status().Update(ctx, show); err != nil {
			log.Error(err, "Failed to update status during Running phase")
			// Retry is usually handled by the requeue
		}

		return ctrl.Result{RequeueAfter: requeueInterval}, nil

	case PhaseCompleted, PhaseFailed:
		log.Info("FireworksShow is in terminal phase, nothing to do", "show", req.NamespacedName, "phase", show.Status.Phase)
		delete(r.lastLaunchTimes, req.NamespacedName) // Clean up map entry
		// Optional: Implement cleanup logic for leftover resources if needed
		return ctrl.Result{}, nil

	default:
		log.Info("Unknown phase", "show", req.NamespacedName, "phase", show.Status.Phase)
		return ctrl.Result{}, nil
	}
}

func (r *FireworksShowReconciler) createFireworksPod(ctx context.Context, show *fireworksv1alpha1.FireworksShow) (*corev1.Pod, error) {
	log := logf.FromContext(ctx)

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			// Generate a unique name for each pod
			Name:      fmt.Sprintf("firework-%s-%s", show.Name, randString(5)),
			Namespace: show.Namespace,
			Labels: map[string]string{
				"app":            "firework-pod",
				"fireworks-show": show.Name, // Label to associate pod with its show
			},
		},
		Spec: *show.Spec.PodSpecTemplate.Spec.DeepCopy(), // Use template spec
	}

	// Ensure restart policy is Never or OnFailure as required by the controller logic
	if pod.Spec.RestartPolicy != corev1.RestartPolicyNever && pod.Spec.RestartPolicy != corev1.RestartPolicyOnFailure {
		log.Info("PodSpecTemplate has invalid RestartPolicy, forcing to Never", "show", show.Name, "originalPolicy", pod.Spec.RestartPolicy)
		pod.Spec.RestartPolicy = corev1.RestartPolicyNever
	}
	// Set short grace period for quick termination
	if pod.Spec.TerminationGracePeriodSeconds == nil {
		gracePeriod := int64(1)
		pod.Spec.TerminationGracePeriodSeconds = &gracePeriod
	}

	// Set the owner reference so the pod gets garbage collected when the show is deleted
	if err := controllerutil.SetControllerReference(show, pod, r.Scheme); err != nil {
		log.Error(err, "Failed to set owner reference on pod", "show", show.Name)
		return nil, fmt.Errorf("failed to set owner reference: %w", err)
	}

	log.V(1).Info("Creating firework pod", "pod", pod.Name, "namespace", pod.Namespace)
	if err := r.Create(ctx, pod); err != nil {
		log.Error(err, "Failed to create pod in cluster", "pod", pod.Name)
		return nil, fmt.Errorf("failed to create pod: %w", err)
	}

	return pod, nil
}

func (r *FireworksShowReconciler) getActivePods(ctx context.Context, show *fireworksv1alpha1.FireworksShow) ([]corev1.Pod, error) {
	podList := &corev1.PodList{}
	listOpts := []client.ListOption{
		client.InNamespace(show.Namespace),
		client.MatchingLabels{"fireworks-show": show.Name},
	}

	if err := r.List(ctx, podList, listOpts...); err != nil {
		return nil, err
	}

	activePods := []corev1.Pod{}
	for _, pod := range podList.Items {
		if pod.Status.Phase == corev1.PodPending || pod.Status.Phase == corev1.PodRunning {
			activePods = append(activePods, pod)
		}
	}
	return activePods, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *FireworksShowReconciler) SetupWithManager(mgr ctrl.Manager) error {
	r.Recorder = mgr.GetEventRecorderFor("fireworksshow-controller")

	return ctrl.NewControllerManagedBy(mgr).
		For(&fireworksv1alpha1.FireworksShow{}).
		// Watch Pods owned by FireworksShow
		Owns(&corev1.Pod{}).
		Named("fireworksshow").
		Complete(r)
}

// Helper function to generate random strings for pod names
var letterRunes = []rune("abcdefghijklmnopqrstuvwxyz1234567890")

func randString(n int) string {
	b := make([]rune, n)
	// Seed the random number generator
	// Note: In a real-world controller, consider a better seeding strategy if needed.
	// Using time.Now().UnixNano() is common but might not be perfectly random across concurrent reconciles.
	// For this example, it's sufficient.
	// rand.Seed(time.Now().UnixNano()) // Deprecated since Go 1.20
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	for i := range b {
		b[i] = letterRunes[r.Intn(len(letterRunes))]
	}
	return string(b)
}
