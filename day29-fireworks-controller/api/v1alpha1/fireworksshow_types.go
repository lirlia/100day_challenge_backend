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

package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// EDIT THIS FILE!  THIS IS SCAFFOLDING FOR YOU TO OWN!
// NOTE: json tags are required.  Any new fields you add must have json tags for the fields to be serialized.

// FireworksShowSpec defines the desired state of FireworksShow.
type FireworksShowSpec struct {
	// DurationSeconds specifies the duration of the fireworks show in seconds.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=300
	DurationSeconds int32 `json:"durationSeconds"`

	// Intensity specifies the maximum number of Pods to attempt launching per second.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=20
	Intensity int32 `json:"intensity"`

	// PodSpecTemplate defines the template for the Pods to be launched as fireworks.
	// The Pod's RestartPolicy must be Never or OnFailure.
	// Recommended command: ["sh", "-c", "echo '🎆 Launching...'; sleep 1; echo '✨ Boom!'; exit 0"]
	// +kubebuilder:validation:Required
	PodSpecTemplate corev1.PodTemplateSpec `json:"podSpecTemplate"`
}

// FireworksShowStatus defines the observed state of FireworksShow.
type FireworksShowStatus struct {
	// StartTime records the actual start time of the fireworks show.
	// +optional
	StartTime *metav1.Time `json:"startTime,omitempty"`

	// EndTime records the calculated end time of the fireworks show.
	// +optional
	EndTime *metav1.Time `json:"endTime,omitempty"`

	// LaunchedPodsCount counts the total number of Pods attempted to be launched.
	// +optional
	LaunchedPodsCount int32 `json:"launchedPodsCount,omitempty"`

	// ActivePodsCount counts the number of currently active (Pending or Running) firework Pods.
	// +optional
	ActivePodsCount int32 `json:"activePodsCount,omitempty"`

	// Phase represents the current state of the fireworks show.
	// +optional
	Phase string `json:"phase,omitempty"` // e.g., Pending, Running, Completed, Failed

	// Conditions provide detailed status conditions of the fireworks show.
	// +optional
	// +listType=map
	// +listMapKey=type
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type="string",JSONPath=".status.phase",description="Current phase of the fireworks show"
// +kubebuilder:printcolumn:name="Duration",type="integer",JSONPath=".spec.durationSeconds",description="Duration in seconds"
// +kubebuilder:printcolumn:name="Intensity",type="integer",JSONPath=".spec.intensity",description="Pods launched per second"
// +kubebuilder:printcolumn:name="Launched",type="integer",JSONPath=".status.launchedPodsCount",description="Total pods launched"
// +kubebuilder:printcolumn:name="Active",type="integer",JSONPath=".status.activePodsCount",description="Currently active pods"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp"

// FireworksShow is the Schema for the fireworksshows API.
type FireworksShow struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   FireworksShowSpec   `json:"spec,omitempty"`
	Status FireworksShowStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// FireworksShowList contains a list of FireworksShow.
type FireworksShowList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []FireworksShow `json:"items"`
}

func init() {
	SchemeBuilder.Register(&FireworksShow{}, &FireworksShowList{})
}
