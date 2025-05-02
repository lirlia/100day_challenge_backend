import * as k8s from '@kubernetes/client-node';

// ~/.kube/config または環境変数から設定を読み込む
const kc = new k8s.KubeConfig();
kc.loadFromDefault();

// APIクライアントを生成
export const k8sCoreV1Api = kc.makeApiClient(k8s.CoreV1Api);
export const k8sCustomObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);

// FireworksShow CRDの情報
export const fireworksGroup = 'fireworks.example.com';
export const fireworksVersion = 'v1alpha1';
export const fireworksPlural = 'fireworksshows';
