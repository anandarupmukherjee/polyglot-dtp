Kubernetes deployment (demo)

Prerequisites
- A local cluster: kind or minikube
- kubectl installed and pointing to your cluster context
- Docker daemon with access to build images

1) Create namespace and base services

kubectl apply -f namespace.yaml
kubectl apply -k postgres-timescale
kubectl apply -k influx
kubectl apply -k minio
kubectl apply -f neo4j/secret.yaml
kubectl apply -f neo4j/service.yaml
kubectl apply -f neo4j/statefulset.yaml

2) Build app images locally

docker build -t dtp-django:dev infrastructure/django
docker build -t dtp-react:dev ui/react --build-arg VITE_API_BASE=http://localhost:30084
docker build -t dtp-simulator:dev data-collection/simulator
docker build -t dtp-alert-gateway:dev data-collection/alert_gateway
docker build -t dtp-twin-lift:dev twins/lift

3) Load images into your cluster

- kind:
  kind load docker-image dtp-django:dev dtp-react:dev dtp-simulator:dev dtp-alert-gateway:dev dtp-twin-lift:dev

- minikube:
  minikube image load dtp-django:dev
  minikube image load dtp-react:dev
  minikube image load dtp-simulator:dev
  minikube image load dtp-alert-gateway:dev
  minikube image load dtp-twin-lift:dev

4) Deploy app workloads

kubectl apply -f mqtt
kubectl apply -f django
kubectl apply -f react
kubectl apply -f simulator
kubectl apply -f alert-gateway
kubectl apply -f twin-lift

5) Access UIs (NodePorts)
- React Portal: http://localhost:30083
- Django API: http://localhost:30084
- Lift Grafana: http://localhost:33001
- (Optional) port-forward Influx/Neo4j/MinIO as needed

6) Login
- Demo user: the Django entrypoint seeds demo `demo@example.com` / `demo12345`
- Get a JWT in the React portal login page

Cleanup
kubectl delete -f twin-lift
kubectl delete -f alert-gateway
kubectl delete -f simulator
kubectl delete -f react
kubectl delete -f django
kubectl delete -f mqtt
kubectl delete -f neo4j --ignore-not-found=true
kubectl delete -k minio
kubectl delete -k influx
kubectl delete -k postgres-timescale
kubectl delete -f namespace.yaml

