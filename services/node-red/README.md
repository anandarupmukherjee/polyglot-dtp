# Node-RED Service Library

This folder collects reusable Node-RED flow templates that can be dragged into the Twin Composer workspace to assemble data pipelines quickly. The Docker compose definition mounts the `library` directory into the Node-RED container so each flow appears under the *Import ? Library* menu.

## Structure
- `library/sensors/` – synthetic data generators and signal conditioning nodes.
- `library/mqtt/` – publisher/subscriber building blocks for MQTT topics.
- `library/storage/` – templates for persisting telemetry to external databases.

Each file is a standard Node-RED export (an array of nodes). Import a template, tweak the configuration (topic names, connection strings, measurement names, etc.), and then wire the pieces together to form an end-to-end pipeline.

## Customisation notes
- MQTT templates assume the broker is reachable at `mqtt:1883` inside Docker (the default from `compose.yaml`). Update the broker configuration if you are targeting a different host.
- Database templates rely on community nodes such as `node-red-contrib-influxdb` or `node-red-node-postgres`. Install them from the Node-RED palette manager before deploying the flows.
- Synthetic sensor generators expose defaults via flow context (for example `flow.set('assetId', 'asset-001')`). Change those values in the function node’s *Setup* tab or by adding dashboard controls.

## Adding new services
Create additional folders (for example `analytics/`, `quality/`) and drop new flow exports inside. They will be picked up automatically on the next container restart (or immediately if the file already exists and you rescan the library from the Node-RED editor).

