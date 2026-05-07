"""Process Modelling API — DES (Discrete Event Simulation) with SimPy."""
import json
import threading
import random
import xml.etree.ElementTree as ET
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from .models import ProcessModel


# ─── DES Element Definitions ──────────────────────────────────────────────────

PROCESS_ELEMENTS = {
    "flow": [
        {"id": "source", "name": "Source", "icon": "▶", "category": "flow",
         "description": "Generates entities at intervals",
         "config": {"inter_arrival": 5.0, "distribution": "exponential", "entity_type": "item", "max_entities": 100},
         "ports_in": [], "ports_out": ["out"]},
        {"id": "sink", "name": "Sink", "icon": "■", "category": "flow",
         "description": "Entities leave the system",
         "config": {},
         "ports_in": ["in"], "ports_out": []},
        {"id": "queue", "name": "Queue", "icon": "≡", "category": "flow",
         "description": "Waiting area with optional capacity limit",
         "config": {"capacity": 0, "discipline": "FIFO"},
         "ports_in": ["in"], "ports_out": ["out"]},
        {"id": "server", "name": "Server", "icon": "⚙", "category": "flow",
         "description": "Processes entities with service time",
         "config": {"service_time": 3.0, "distribution": "exponential", "num_servers": 1},
         "ports_in": ["in"], "ports_out": ["out"]},
        {"id": "delay", "name": "Delay", "icon": "⏳", "category": "flow",
         "description": "Fixed or random delay",
         "config": {"delay_time": 2.0, "distribution": "fixed"},
         "ports_in": ["in"], "ports_out": ["out"]},
    ],
    "routing": [
        {"id": "branch", "name": "Branch", "icon": "⑂", "category": "routing",
         "description": "Routes entities by probability or condition",
         "config": {"probability": 0.5, "mode": "probability"},
         "ports_in": ["in"], "ports_out": ["out_a", "out_b"]},
        {"id": "merge", "name": "Merge", "icon": "⊤", "category": "routing",
         "description": "Merges multiple flows into one",
         "config": {},
         "ports_in": ["in_a", "in_b"], "ports_out": ["out"]},
        {"id": "batch", "name": "Batch", "icon": "⊞", "category": "routing",
         "description": "Groups entities into batches",
         "config": {"batch_size": 5, "timeout": 0},
         "ports_in": ["in"], "ports_out": ["out"]},
        {"id": "unbatch", "name": "Unbatch", "icon": "⊟", "category": "routing",
         "description": "Splits batches into individual entities",
         "config": {},
         "ports_in": ["in"], "ports_out": ["out"]},
    ],
    "resources": [
        {"id": "resource", "name": "Resource", "icon": "👤", "category": "resources",
         "description": "Shared resource with limited capacity",
         "config": {"capacity": 1, "name": "worker"},
         "ports_in": ["request"], "ports_out": ["release"]},
        {"id": "store", "name": "Store", "icon": "📦", "category": "resources",
         "description": "Storage with get/put operations",
         "config": {"capacity": 10},
         "ports_in": ["put"], "ports_out": ["get"]},
        {"id": "counter", "name": "Counter", "icon": "⊕", "category": "resources",
         "description": "Counts passing entities",
         "config": {"name": "counter_1"},
         "ports_in": ["in"], "ports_out": ["out"]},
    ],
    "monitoring": [
        {"id": "monitor", "name": "Monitor", "icon": "📊", "category": "monitoring",
         "description": "Records statistics over time",
         "config": {"metric": "wait_time", "interval": 1.0},
         "ports_in": ["in"], "ports_out": ["out"]},
        {"id": "logger", "name": "Logger", "icon": "📝", "category": "monitoring",
         "description": "Logs entity events",
         "config": {},
         "ports_in": ["in"], "ports_out": ["out"]},
    ],
}


# ─── API Endpoints ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def process_elements(request):
    return JsonResponse(PROCESS_ELEMENTS)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def process_list(request):
    if request.method == "GET":
        items = ProcessModel.objects.filter(user=request.user).order_by("-updated_at")[:20]
        return JsonResponse([{
            "id": str(p.id), "name": p.name, "status": p.status,
            "updated_at": p.updated_at.isoformat(),
        } for p in items], safe=False)

    data = request.data
    name = (data.get("name") or "").strip() or "Untitled Process"
    p = ProcessModel.objects.create(
        user=request.user, name=name,
        canvas_state=data.get("canvas_state", {}),
        sim_config=data.get("sim_config", {"duration": 100, "seed": 42}),
    )
    return JsonResponse({"id": str(p.id), "name": p.name, "status": p.status})


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def process_detail(request, process_id):
    try:
        p = ProcessModel.objects.get(id=process_id, user=request.user)
    except ProcessModel.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if request.method == "GET":
        return JsonResponse({
            "id": str(p.id), "name": p.name, "status": p.status,
            "canvas_state": p.canvas_state, "sim_config": p.sim_config,
            "sim_results": p.sim_results, "sim_log": p.sim_log,
            "resulting_twin_id": p.resulting_twin_id,
        })
    if request.method == "DELETE":
        # Also clean up the associated twin if built
        if p.resulting_twin_id:
            from .models import Twin, TwinUI, AccessGrant
            Twin.objects.filter(twin_id=p.resulting_twin_id).delete()
            for ui in TwinUI.objects.filter(dtr_id=p.resulting_twin_id):
                AccessGrant.objects.filter(twin=ui).delete()
                ui.delete()
        p.delete()
        return JsonResponse({"ok": True})
    # PATCH
    data = request.data
    if "name" in data: p.name = data["name"]
    if "canvas_state" in data: p.canvas_state = data["canvas_state"]
    if "sim_config" in data: p.sim_config = data["sim_config"]
    p.save()
    return JsonResponse({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def process_simulate(request, process_id):
    try:
        p = ProcessModel.objects.get(id=process_id, user=request.user)
    except ProcessModel.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    p.status = "running"
    p.sim_results = {}
    p.sim_log = None
    p.save()

    threading.Thread(target=_run_simulation, args=(p,), daemon=True).start()
    return JsonResponse({"ok": True, "status": "running"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def process_status(request, process_id):
    try:
        p = ProcessModel.objects.get(id=process_id, user=request.user)
    except ProcessModel.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)
    return JsonResponse({
        "status": p.status, "sim_results": p.sim_results, "sim_log": p.sim_log,
    })


# ─── SimPy Simulation Engine ─────────────────────────────────────────────────

def _run_simulation(proc):
    """Run a DES simulation using SimPy based on the process model canvas."""
    try:
        import simpy

        canvas = proc.canvas_state or {}
        nodes = canvas.get("nodes", [])
        connections = canvas.get("connections", [])
        config = proc.sim_config or {}
        duration = config.get("duration", 100)
        seed = config.get("seed", 42)

        if not nodes:
            proc.status = "failed"
            proc.sim_log = "No nodes in the model"
            proc.save()
            return

        random.seed(seed)
        env = simpy.Environment()

        # Build adjacency
        outgoing = {}  # nodeId -> [{ toNodeId, toPort, fromPort }]
        for c in connections:
            outgoing.setdefault(c["fromNodeId"], []).append(c)

        # Statistics collectors
        stats = {
            "entities_created": 0,
            "entities_completed": 0,
            "entity_times": [],       # total time in system per entity
            "queue_lengths": {},       # nodeId -> [timestamps, lengths]
            "server_utilization": {},  # nodeId -> busy_time
            "counter_values": {},      # nodeId -> count
            "events": [],             # log of events
        }

        # SimPy resources and stores per node
        resources = {}
        stores = {}
        node_map = {n["id"]: n for n in nodes}

        # Create SimPy resources
        for n in nodes:
            nid = n["id"]
            cfg = n.get("config", {})
            elem = n.get("toolId", "")

            if elem == "server":
                cap = cfg.get("num_servers", 1)
                resources[nid] = simpy.Resource(env, capacity=max(1, cap))
                stats["server_utilization"][nid] = 0
            elif elem == "queue":
                cap = cfg.get("capacity", 0)
                if cap > 0:
                    stores[nid] = simpy.Store(env, capacity=cap)
                else:
                    stores[nid] = simpy.Store(env)
                stats["queue_lengths"][nid] = []
            elif elem == "resource":
                cap = cfg.get("capacity", 1)
                resources[nid] = simpy.Resource(env, capacity=max(1, cap))
            elif elem == "store":
                cap = cfg.get("capacity", 10)
                stores[nid] = simpy.Store(env, capacity=cap)
            elif elem == "counter":
                stats["counter_values"][nid] = 0

        def _sample(dist, mean):
            if dist == "exponential":
                return random.expovariate(1.0 / max(0.01, mean))
            elif dist == "uniform":
                return random.uniform(mean * 0.5, mean * 1.5)
            elif dist == "normal":
                return max(0.01, random.gauss(mean, mean * 0.2))
            return mean  # fixed

        def _get_next_nodes(nid):
            return [(c["toNodeId"], c.get("toPort", "")) for c in outgoing.get(nid, [])]

        def _process_entity(entity, node_id):
            """Process an entity through a node and route to next."""
            n = node_map.get(node_id)
            if not n:
                return
            elem = n.get("toolId", "")
            cfg = n.get("config", {})
            nid = n["id"]

            if elem == "queue":
                store = stores.get(nid)
                if store:
                    stats["queue_lengths"].setdefault(nid, []).append((env.now, len(store.items)))
                    yield store.put(entity)
                    item = yield store.get()
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "server":
                res = resources.get(nid)
                if res:
                    arrive = env.now
                    with res.request() as req:
                        yield req
                        wait = env.now - arrive
                        st = _sample(cfg.get("distribution", "exponential"), cfg.get("service_time", 3))
                        yield env.timeout(st)
                        stats["server_utilization"][nid] = stats["server_utilization"].get(nid, 0) + st
                        stats["events"].append({"t": round(env.now, 2), "node": n.get("label", nid), "event": "served", "entity": entity["id"], "wait": round(wait, 2), "service": round(st, 2)})
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "delay":
                dt = _sample(cfg.get("distribution", "fixed"), cfg.get("delay_time", 2))
                yield env.timeout(dt)
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "branch":
                nexts = _get_next_nodes(nid)
                if len(nexts) >= 2:
                    prob = cfg.get("probability", 0.5)
                    chosen = nexts[0] if random.random() < prob else nexts[1]
                    env.process(_process_entity(entity, chosen[0]))
                elif nexts:
                    env.process(_process_entity(entity, nexts[0][0]))

            elif elem == "merge":
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "batch":
                store = stores.setdefault(nid, simpy.Store(env))
                yield store.put(entity)
                if len(store.items) >= cfg.get("batch_size", 5):
                    batch_items = []
                    for _ in range(cfg.get("batch_size", 5)):
                        item = yield store.get()
                        batch_items.append(item)
                    batch_entity = {"id": f"batch_{entity['id']}", "born": min(e["born"] for e in batch_items), "items": batch_items}
                    for next_id, _ in _get_next_nodes(nid):
                        env.process(_process_entity(batch_entity, next_id))

            elif elem == "unbatch":
                items = entity.get("items", [entity])
                for item in items:
                    for next_id, _ in _get_next_nodes(nid):
                        env.process(_process_entity(item, next_id))

            elif elem == "counter":
                stats["counter_values"][nid] = stats["counter_values"].get(nid, 0) + 1
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "monitor":
                stats["events"].append({"t": round(env.now, 2), "node": n.get("label", nid), "event": "monitor", "entity": entity["id"]})
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "logger":
                stats["events"].append({"t": round(env.now, 2), "node": n.get("label", nid), "event": "log", "entity": entity["id"]})
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

            elif elem == "sink":
                stats["entities_completed"] += 1
                lifetime = env.now - entity.get("born", 0)
                stats["entity_times"].append(round(lifetime, 2))
                stats["events"].append({"t": round(env.now, 2), "node": n.get("label", nid), "event": "completed", "entity": entity["id"], "lifetime": round(lifetime, 2)})

        def _source_process(n):
            cfg = n.get("config", {})
            nid = n["id"]
            max_ent = cfg.get("max_entities", 100)
            count = 0
            while count < max_ent:
                ia = _sample(cfg.get("distribution", "exponential"), cfg.get("inter_arrival", 5))
                yield env.timeout(ia)
                count += 1
                stats["entities_created"] += 1
                entity = {"id": f"e{count}", "born": env.now, "type": cfg.get("entity_type", "item")}
                stats["events"].append({"t": round(env.now, 2), "node": n.get("label", nid), "event": "created", "entity": entity["id"]})
                for next_id, _ in _get_next_nodes(nid):
                    env.process(_process_entity(entity, next_id))

        # Start source processes
        for n in nodes:
            if n.get("toolId") == "source":
                env.process(_source_process(n))

        # Run simulation
        env.run(until=duration)

        # Compute summary
        entity_times = stats["entity_times"]
        summary = {
            "duration": duration,
            "entities_created": stats["entities_created"],
            "entities_completed": stats["entities_completed"],
            "avg_time_in_system": round(sum(entity_times) / len(entity_times), 2) if entity_times else 0,
            "min_time": round(min(entity_times), 2) if entity_times else 0,
            "max_time": round(max(entity_times), 2) if entity_times else 0,
            "server_utilization": {
                nid: round(busy / duration * 100, 1)
                for nid, busy in stats["server_utilization"].items()
            },
            "counter_values": stats["counter_values"],
            "throughput": round(stats["entities_completed"] / duration, 3) if duration > 0 else 0,
        }

        # Compute viz/KPI node results
        viz_results = {}
        incoming = {}
        for c in connections:
            incoming.setdefault(c["toNodeId"], []).append(c)

        for n in nodes:
            nid = n["id"]
            tid = n.get("toolId", "")
            if not tid.startswith("viz_") and not tid.startswith("kpi_"):
                continue
            # Find what this viz is connected to
            conns = incoming.get(nid, [])
            observed_ids = [c["fromNodeId"] for c in conns]
            observed_labels = [node_map.get(oid, {}).get("label", oid) for oid in observed_ids]

            if tid == "viz_throughput":
                # Throughput over time windows
                window = n.get("config", {}).get("window", 10)
                buckets = int(duration / max(1, window))
                points = []
                for b in range(buckets):
                    t_start, t_end = b * window, (b + 1) * window
                    count = sum(1 for ev in stats["events"] if ev.get("event") == "completed" and t_start <= ev["t"] < t_end)
                    points.append({"t": round(t_end, 1), "v": round(count / window, 2)})
                viz_results[nid] = {"points": points, "latest": points[-1]["v"] if points else 0}

            elif tid == "viz_utilization":
                # Get utilization of connected server
                util = 0
                for oid in observed_ids:
                    if oid in stats["server_utilization"]:
                        util = round(stats["server_utilization"][oid] / duration * 100, 1)
                        break
                viz_results[nid] = {"value": util}

            elif tid == "viz_wait_time":
                # Extract wait times from events at connected nodes
                waits = [ev["wait"] for ev in stats["events"] if ev.get("wait") is not None and ev.get("node") in observed_labels]
                if not waits:
                    waits = [ev["wait"] for ev in stats["events"] if ev.get("wait") is not None]
                viz_results[nid] = {
                    "avg": round(sum(waits) / len(waits), 2) if waits else 0,
                    "min": round(min(waits), 2) if waits else 0,
                    "max": round(max(waits), 2) if waits else 0,
                    "count": len(waits),
                }

            elif tid == "viz_queue_length":
                points = []
                for oid in observed_ids:
                    ql = stats.get("queue_lengths", {}).get(oid, [])
                    for t, l in ql:
                        points.append({"t": round(t, 1), "v": l})
                if not points:
                    points = [{"t": 0, "v": 0}]
                viz_results[nid] = {"points": sorted(points, key=lambda p: p["t"])[-30:]}

            elif tid == "viz_histogram":
                metric = n.get("config", {}).get("metric", "service_time")
                values = entity_times if metric == "cycle_time" else [ev.get("service", ev.get("wait", 0)) for ev in stats["events"] if ev.get("service") is not None or ev.get("wait") is not None]
                bins_n = n.get("config", {}).get("bins", 15)
                if values:
                    mn, mx = min(values), max(values)
                    rng = mx - mn or 1
                    bw = rng / bins_n
                    hist = [0] * bins_n
                    for v in values:
                        b = min(bins_n - 1, int((v - mn) / bw))
                        hist[b] += 1
                    viz_results[nid] = {"bins": hist, "min": round(mn, 2), "max": round(mx, 2)}
                else:
                    viz_results[nid] = {"bins": [], "min": 0, "max": 0}

            elif tid == "viz_entity_flow":
                # Count entities at connection
                count = sum(1 for ev in stats["events"] if ev.get("node") in observed_labels)
                viz_results[nid] = {"display": str(count), "detail": "entities passed"}

            elif tid == "viz_timeline":
                # Entity lifecycle timeline
                max_ent = n.get("config", {}).get("max_entities", 20)
                entities = {}
                for ev in stats["events"]:
                    eid = ev.get("entity", "")
                    if eid not in entities:
                        entities[eid] = {"id": eid, "events": []}
                    entities[eid]["events"].append({"t": ev["t"], "event": ev["event"], "node": ev.get("node", "")})
                timeline = list(entities.values())[:max_ent]
                viz_results[nid] = {"timeline": timeline}

            elif tid == "kpi_cycle_time":
                avg = round(sum(entity_times) / len(entity_times), 2) if entity_times else 0
                viz_results[nid] = {"display": f"{avg}", "detail": "avg cycle time"}

            elif tid == "kpi_wip":
                wip = stats["entities_created"] - stats["entities_completed"]
                viz_results[nid] = {"display": str(wip), "detail": "in progress"}

            elif tid == "kpi_bottleneck":
                if stats["server_utilization"]:
                    worst_id = max(stats["server_utilization"], key=stats["server_utilization"].get)
                    worst_label = node_map.get(worst_id, {}).get("label", worst_id)
                    worst_pct = round(stats["server_utilization"][worst_id] / duration * 100, 1)
                    viz_results[nid] = {"display": worst_label, "detail": f"{worst_pct}% utilization"}
                else:
                    viz_results[nid] = {"display": "N/A", "detail": "no servers"}

            elif tid == "kpi_efficiency":
                if entity_times and duration > 0:
                    total_service = sum(stats["server_utilization"].values())
                    eff = round(total_service / (stats["entities_completed"] * (sum(entity_times) / len(entity_times))) * 100, 1) if stats["entities_completed"] > 0 and entity_times else 0
                    viz_results[nid] = {"display": f"{min(100, eff)}%", "detail": "value-add ratio"}
                else:
                    viz_results[nid] = {"display": "0%", "detail": "no data"}

        proc.status = "completed"
        proc.sim_results = {
            "summary": summary,
            "events": stats["events"][-200:],
            "entity_times": entity_times[-100:],
            "viz_nodes": viz_results,
        }
        proc.sim_log = f"Simulation completed. {stats['entities_created']} created, {stats['entities_completed']} completed in {duration} time units."
        proc.save()

    except Exception as e:
        proc.status = "failed"
        proc.sim_log = f"Simulation error: {e}"
        proc.sim_results = {}
        proc.save()


# ─── BPMN Parser ──────────────────────────────────────────────────────────────

# Common BPMN XML namespaces
BPMN_NS = {
    'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'bpmn2': 'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'bpmndi': 'http://www.omg.org/spec/BPMN/20100524/DI',
    'dc': 'http://www.omg.org/spec/DD/20100524/DC',
    'di': 'http://www.omg.org/spec/DD/20100524/DI',
}


def _parse_bpmn(xml_content):
    """Parse BPMN XML and convert to process model nodes/connections."""
    root = ET.fromstring(xml_content)

    # Detect namespace - BPMN files use varying namespace prefixes
    ns = ''
    for prefix, uri in BPMN_NS.items():
        if root.tag.startswith('{' + uri + '}') or root.find(f'.//{{{uri}}}process') is not None:
            ns = uri
            break
    # Fallback: try to extract from root tag
    if not ns and '{' in root.tag:
        ns = root.tag.split('}')[0].strip('{')

    def _find(tag):
        """Find all elements matching a BPMN tag, trying multiple namespace patterns."""
        results = []
        for uri in [ns] + list(BPMN_NS.values()):
            results.extend(root.iter(f'{{{uri}}}{tag}'))
        # Also try without namespace
        results.extend(root.iter(tag))
        # Deduplicate by element id
        seen = set()
        unique = []
        for el in results:
            eid = el.get('id', id(el))
            if eid not in seen:
                seen.add(eid)
                unique.append(el)
        return unique

    nodes = []
    connections = []
    id_map = {}  # bpmn_id -> our_node_id

    # Layout: try to get positions from BPMNDI
    positions = {}
    for shape in _find('BPMNShape'):
        ref = shape.get('bpmnElement', '')
        for bounds in shape:
            if 'Bounds' in bounds.tag:
                try:
                    positions[ref] = {
                        'x': float(bounds.get('x', 0)),
                        'y': float(bounds.get('y', 0)),
                    }
                except (ValueError, TypeError):
                    pass

    def _pos(bpmn_id, idx):
        if bpmn_id in positions:
            return positions[bpmn_id]
        # Auto-layout: spread horizontally
        return {'x': 100 + idx * 200, 'y': 100 + (idx % 3) * 120}

    # Build element → process/participant membership
    element_process = {}  # bpmn_element_id -> { process_id, process_name, participant_name }
    process_names = {}  # process_id -> name
    for part in _find('participant'):
        part_id = part.get('id', '')
        proc_ref = part.get('processRef', '')
        part_name = part.get('name', '')
        if proc_ref:
            process_names[proc_ref] = part_name or proc_ref
    for proc_el in _find('process'):
        proc_id = proc_el.get('id', '')
        proc_name = process_names.get(proc_id, proc_el.get('name', proc_id))
        process_names[proc_id] = proc_name
        for child in proc_el.iter():
            child_id = child.get('id', '')
            if child_id and child_id != proc_id:
                element_process[child_id] = {'process_id': proc_id, 'process_name': proc_name}

    idx = 0

    def _make_node(bpmn_id, toolId, label, icon, category, pos, config, ports_in, ports_out):
        nonlocal idx
        node_id = f'bpmn_{idx}'
        proc_info = element_process.get(bpmn_id, {})
        nodes.append({
            'id': node_id, 'toolId': toolId, 'label': label, 'icon': icon,
            'category': category, 'x': pos['x'], 'y': pos['y'],
            'config': config, 'ports_in': ports_in, 'ports_out': ports_out,
            'process_name': proc_info.get('process_name', ''),
            'process_id': proc_info.get('process_id', ''),
        })
        id_map[bpmn_id] = node_id
        idx += 1
        return node_id

    # Start events → Source
    for el in _find('startEvent'):
        bpmn_id = el.get('id', f'start_{idx}')
        name = el.get('name', 'Start')
        _make_node(bpmn_id, 'source', name or 'Start', '▶', 'flow', _pos(bpmn_id, idx),
            {'inter_arrival': 5, 'distribution': 'exponential', 'entity_type': 'item', 'max_entities': 100}, [], ['out'])

    # End events → Sink
    for el in _find('endEvent'):
        bpmn_id = el.get('id', f'end_{idx}')
        name = el.get('name', 'End')
        _make_node(bpmn_id, 'sink', name or 'End', '■', 'flow', _pos(bpmn_id, idx), {}, ['in'], [])

    # Tasks (all types) → Server
    for tag in ('task', 'userTask', 'serviceTask', 'sendTask', 'receiveTask',
                'manualTask', 'businessRuleTask', 'scriptTask', 'subProcess', 'callActivity'):
        for el in _find(tag):
            bpmn_id = el.get('id', f'task_{idx}')
            name = el.get('name', tag.replace('Task', '').replace('task', 'Task'))
            _make_node(bpmn_id, 'server', name or f'Task {idx}', '⚙', 'flow', _pos(bpmn_id, idx),
                {'service_time': 3, 'distribution': 'exponential', 'num_servers': 1}, ['in'], ['out'])

    # Exclusive gateways → Branch or Merge
    for el in _find('exclusiveGateway'):
        bpmn_id = el.get('id', f'gw_{idx}')
        name = el.get('name', '')
        outgoing = [sf for sf in _find('sequenceFlow') if sf.get('sourceRef') == bpmn_id]
        if len(outgoing) > 1:
            _make_node(bpmn_id, 'branch', name or 'Decision', '⑂', 'routing', _pos(bpmn_id, idx),
                {'probability': 0.5}, ['in'], ['out_a', 'out_b'])
        else:
            _make_node(bpmn_id, 'merge', name or 'Merge', '⊤', 'routing', _pos(bpmn_id, idx),
                {}, ['in_a', 'in_b'], ['out'])

    # Parallel gateways → also Branch/Merge
    for el in _find('parallelGateway'):
        bpmn_id = el.get('id', f'pgw_{idx}')
        name = el.get('name', '')
        outgoing = [sf for sf in _find('sequenceFlow') if sf.get('sourceRef') == bpmn_id]
        if len(outgoing) > 1:
            _make_node(bpmn_id, 'branch', name or 'Parallel Split', '⑂', 'routing', _pos(bpmn_id, idx),
                {'probability': 0.5}, ['in'], ['out_a', 'out_b'])
        else:
            _make_node(bpmn_id, 'merge', name or 'Parallel Join', '⊤', 'routing', _pos(bpmn_id, idx),
                {}, ['in_a', 'in_b'], ['out'])

    # Intermediate events → Delay
    for tag in ('intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent'):
        for el in _find(tag):
            bpmn_id = el.get('id', f'evt_{idx}')
            name = el.get('name', 'Event')
            _make_node(bpmn_id, 'delay', name or 'Wait', '⏳', 'flow', _pos(bpmn_id, idx),
                {'delay_time': 2, 'distribution': 'fixed'}, ['in'], ['out'])

    # Inclusive, event-based, and complex gateways (must be before sequence flows)
    for gw_type in ('inclusiveGateway', 'eventBasedGateway', 'complexGateway'):
        for el in _find(gw_type):
            bpmn_id = el.get('id', f'gw_{idx}')
            if bpmn_id in id_map:
                continue
            name = el.get('name', '')
            outgoing = [sf for sf in _find('sequenceFlow') if sf.get('sourceRef') == bpmn_id]
            if len(outgoing) > 1:
                _make_node(bpmn_id, 'branch', name or gw_type.replace('Gateway', ''), '⑂', 'routing',
                    _pos(bpmn_id, idx), {'probability': 0.5}, ['in'], ['out_a', 'out_b'])
            else:
                _make_node(bpmn_id, 'merge', name or 'Join', '⊤', 'routing',
                    _pos(bpmn_id, idx), {}, ['in_a', 'in_b'], ['out'])

    # Parse lanes for grouping (within a single process with multiple lanes)
    lane_membership = {}  # element_id -> lane_name
    for lane_set in _find('laneSet'):
        for lane in lane_set:
            if 'lane' not in lane.tag.lower():
                continue
            lane_name = lane.get('name', '')
            for flow_ref in lane:
                if 'flowNodeRef' in flow_ref.tag:
                    ref_id = flow_ref.text
                    if ref_id:
                        lane_membership[ref_id.strip()] = lane_name
    # Also try direct lane elements
    for lane in _find('lane'):
        lane_name = lane.get('name', '')
        for flow_ref in lane:
            if 'flowNodeRef' in flow_ref.tag and flow_ref.text:
                lane_membership[flow_ref.text.strip()] = lane_name

    # Apply lane names to nodes that don't have a process_name yet
    for n in nodes:
        bpmn_id_for_node = None
        for bid, nid in id_map.items():
            if nid == n['id']:
                bpmn_id_for_node = bid
                break
        if bpmn_id_for_node and bpmn_id_for_node in lane_membership:
            lane_name = lane_membership[bpmn_id_for_node]
            if lane_name:
                n['process_name'] = lane_name

    # Sequence flows → Connections
    branch_out_count = {}  # track which output port to use for branches
    merge_in_count = {}
    for sf in _find('sequenceFlow'):
        src_bpmn = sf.get('sourceRef', '')
        tgt_bpmn = sf.get('targetRef', '')
        label = sf.get('name', '')
        src_node = id_map.get(src_bpmn)
        tgt_node = id_map.get(tgt_bpmn)
        if not src_node or not tgt_node:
            continue

        src_n = next((n for n in nodes if n['id'] == src_node), None)
        tgt_n = next((n for n in nodes if n['id'] == tgt_node), None)
        if not src_n or not tgt_n:
            continue

        # Determine port names
        from_port = src_n['ports_out'][0] if src_n['ports_out'] else 'out'
        to_port = tgt_n['ports_in'][0] if tgt_n['ports_in'] else 'in'

        # For branch nodes, alternate output ports
        if src_n['toolId'] == 'branch' and len(src_n['ports_out']) > 1:
            cnt = branch_out_count.get(src_node, 0)
            from_port = src_n['ports_out'][min(cnt, len(src_n['ports_out']) - 1)]
            branch_out_count[src_node] = cnt + 1

        # For merge nodes, alternate input ports
        if tgt_n['toolId'] == 'merge' and len(tgt_n['ports_in']) > 1:
            cnt = merge_in_count.get(tgt_node, 0)
            to_port = tgt_n['ports_in'][min(cnt, len(tgt_n['ports_in']) - 1)]
            merge_in_count[tgt_node] = cnt + 1

        connections.append({
            'id': f'sf_{len(connections)}',
            'fromNodeId': src_node, 'fromPort': from_port,
            'toNodeId': tgt_node, 'toPort': to_port,
            'label': label,
        })

    # Map participants to their process elements for message flow resolution
    participant_map = {}  # participant_id -> process_id
    for part in _find('participant'):
        part_id = part.get('id', '')
        proc_ref = part.get('processRef', '')
        if part_id and proc_ref:
            participant_map[part_id] = proc_ref

    def _resolve_to_node(bpmn_id):
        """Resolve a BPMN ID to a canvas node, handling participant references."""
        # Direct match
        if bpmn_id in id_map:
            return id_map[bpmn_id]
        # Participant → find first/last element in that participant's process
        proc_ref = participant_map.get(bpmn_id)
        if proc_ref:
            # Find any element in that process
            for el_id, node_id in id_map.items():
                # Check if this element is inside the referenced process
                for proc_el in _find('process'):
                    if proc_el.get('id') == proc_ref:
                        for child in proc_el.iter():
                            if child.get('id') == el_id:
                                return node_id
            # Fallback: find start/end event with matching process context
            for el in _find('startEvent'):
                if el.get('id') in id_map:
                    return id_map[el.get('id')]
        return None

    # (inclusive/event-based/complex gateways now parsed before sequence flows)

    # Message flows (cross-pool/participant connections in <collaboration>)
    for mf in _find('messageFlow'):
        src_bpmn = mf.get('sourceRef', '')
        tgt_bpmn = mf.get('targetRef', '')
        label = mf.get('name', '')
        src_node = _resolve_to_node(src_bpmn)
        tgt_node = _resolve_to_node(tgt_bpmn)
        if not src_node or not tgt_node:
            continue
        src_n = next((n for n in nodes if n['id'] == src_node), None)
        tgt_n = next((n for n in nodes if n['id'] == tgt_node), None)
        if not src_n or not tgt_n:
            continue
        from_port = src_n['ports_out'][0] if src_n['ports_out'] else 'out'
        to_port = tgt_n['ports_in'][0] if tgt_n['ports_in'] else 'in'
        connections.append({
            'id': f'mf_{len(connections)}',
            'fromNodeId': src_node, 'fromPort': from_port,
            'toNodeId': tgt_node, 'toPort': to_port,
            'label': label or 'message',
        })

    # Associations (data objects, annotations linked to tasks)
    for assoc in _find('association'):
        src_bpmn = assoc.get('sourceRef', '')
        tgt_bpmn = assoc.get('targetRef', '')
        src_node = id_map.get(src_bpmn)
        tgt_node = id_map.get(tgt_bpmn)
        if src_node and tgt_node:
            src_n = next((n for n in nodes if n['id'] == src_node), None)
            tgt_n = next((n for n in nodes if n['id'] == tgt_node), None)
            if src_n and tgt_n:
                connections.append({
                    'id': f'as_{len(connections)}',
                    'fromNodeId': src_node,
                    'fromPort': src_n['ports_out'][0] if src_n['ports_out'] else 'out',
                    'toNodeId': tgt_node,
                    'toPort': tgt_n['ports_in'][0] if tgt_n.get('ports_in') else 'in',
                    'label': 'assoc',
                })

    # Link events — BPMN uses matching link names to connect across sections
    link_throws = {}  # name -> node_id
    link_catches = {}
    for el in _find('intermediateThrowEvent'):
        for child in el:
            if 'linkEventDefinition' in child.tag:
                link_name = child.get('name', el.get('name', ''))
                if link_name:
                    link_throws[link_name] = id_map.get(el.get('id', ''))
    for el in _find('intermediateCatchEvent'):
        for child in el:
            if 'linkEventDefinition' in child.tag:
                link_name = child.get('name', el.get('name', ''))
                if link_name:
                    link_catches[link_name] = id_map.get(el.get('id', ''))
    for name, throw_id in link_throws.items():
        catch_id = link_catches.get(name)
        if throw_id and catch_id:
            connections.append({
                'id': f'lk_{len(connections)}',
                'fromNodeId': throw_id, 'fromPort': 'out',
                'toNodeId': catch_id, 'toPort': 'in',
                'label': f'link: {name}',
            })

    # Signal events — match by signal name
    signal_throws = {}
    signal_catches = {}
    for el in _find('intermediateThrowEvent'):
        for child in el:
            if 'signalEventDefinition' in child.tag:
                sig_ref = child.get('signalRef', el.get('name', ''))
                if sig_ref:
                    signal_throws.setdefault(sig_ref, []).append(id_map.get(el.get('id', '')))
    for el in _find('intermediateCatchEvent'):
        for child in el:
            if 'signalEventDefinition' in child.tag:
                sig_ref = child.get('signalRef', el.get('name', ''))
                if sig_ref:
                    signal_catches.setdefault(sig_ref, []).append(id_map.get(el.get('id', '')))
    for sig, throwers in signal_throws.items():
        catchers = signal_catches.get(sig, [])
        for t_id in throwers:
            for c_id in catchers:
                if t_id and c_id:
                    connections.append({
                        'id': f'sg_{len(connections)}',
                        'fromNodeId': t_id, 'fromPort': 'out',
                        'toNodeId': c_id, 'toPort': 'in',
                        'label': f'signal: {sig}',
                    })

    # Compute process boundaries from node positions
    process_boundaries = []
    procs_seen = {}
    for n in nodes:
        pname = n.get('process_name', '')
        if not pname:
            continue
        if pname not in procs_seen:
            procs_seen[pname] = {'minX': n['x'], 'minY': n['y'], 'maxX': n['x'] + 170, 'maxY': n['y'] + 60}
        else:
            b = procs_seen[pname]
            b['minX'] = min(b['minX'], n['x'])
            b['minY'] = min(b['minY'], n['y'])
            b['maxX'] = max(b['maxX'], n['x'] + 170)
            b['maxY'] = max(b['maxY'], n['y'] + 60)
    for pname, b in procs_seen.items():
        process_boundaries.append({
            'name': pname,
            'x': b['minX'] - 20, 'y': b['minY'] - 30,
            'width': b['maxX'] - b['minX'] + 40, 'height': b['maxY'] - b['minY'] + 60,
        })

    return {
        'nodes': nodes,
        'connections': connections,
        'process_boundaries': process_boundaries,
        'stats': {
            'elements_parsed': len(nodes),
            'connections_parsed': len(connections),
            'bpmn_elements': {
                'start_events': len(_find('startEvent')),
                'end_events': len(_find('endEvent')),
                'tasks': sum(len(_find(t)) for t in ('task', 'userTask', 'serviceTask', 'sendTask', 'receiveTask', 'manualTask', 'businessRuleTask', 'scriptTask')),
                'gateways': len(_find('exclusiveGateway')) + len(_find('parallelGateway')),
                'inclusive_gateways': len(_find('inclusiveGateway')),
                'event_based_gateways': len(_find('eventBasedGateway')),
                'complex_gateways': len(_find('complexGateway')),
                'sequence_flows': len(_find('sequenceFlow')),
                'message_flows': len(_find('messageFlow')),
                'sub_processes': len(_find('subProcess')),
                'call_activities': len(_find('callActivity')),
                'processes': len(_find('process')),
                'participants': len(_find('participant')),
            },
            'unmapped_connections': [
                {'source': sf.get('sourceRef', ''), 'target': sf.get('targetRef', ''), 'type': 'sequence'}
                for sf in _find('sequenceFlow')
                if not id_map.get(sf.get('sourceRef', '')) or not id_map.get(sf.get('targetRef', ''))
            ][:10],
            'unmapped_message_flows': [
                {'source': mf.get('sourceRef', ''), 'target': mf.get('targetRef', ''), 'name': mf.get('name', '')}
                for mf in _find('messageFlow')
                if not id_map.get(mf.get('sourceRef', '')) or not id_map.get(mf.get('targetRef', ''))
            ][:10],
        },
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def process_lock_and_build(request, process_id):
    """Lock a completed process model and register it as a DT in the platform."""
    try:
        p = ProcessModel.objects.get(id=process_id, user=request.user)
    except ProcessModel.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    if p.status not in ('completed', 'failed', 'locked', 'built'):
        return JsonResponse({"error": f"Cannot lock from status '{p.status}'. Run simulation first."}, status=400)

    from .registration_views import _sanitize_twin_id, _register_twin_in_dtr
    from .models import TwinUI, AccessGrant, Twin

    # Reuse existing twin_id if this process was previously built
    if p.resulting_twin_id and Twin.objects.filter(twin_id=p.resulting_twin_id).exists():
        twin_id = p.resulting_twin_id
    else:
        twin_id = _sanitize_twin_id(p.name)
        if Twin.objects.filter(twin_id=twin_id).exists():
            # Only add suffix if it's a DIFFERENT process using that name
            existing_procs = ProcessModel.objects.filter(resulting_twin_id=twin_id).exclude(id=p.id)
            if existing_procs.exists():
                twin_id = f"{twin_id}_{str(p.id)[:8]}"

    # Extract process KPIs for the twin metadata
    summary = p.sim_results.get("summary", {})
    canvas = p.canvas_state or {}
    nodes = canvas.get("nodes", [])
    connections = canvas.get("connections", [])

    # Build fabric from data_in/data_out connector nodes
    fabric = {"data": [], "decisions": [], "queries": [], "state": []}
    data_streams = []
    for n in nodes:
        tid = n.get("toolId", "")
        cfg = n.get("config", {})
        if tid == "data_in":
            cat = cfg.get("category", "data")
            name = cfg.get("name", "").strip()
            if not name:
                outgoing = [c for c in connections if c.get("fromNodeId") == n["id"]]
                tgt_labels = []
                for c in outgoing:
                    tgt_node = next((nd for nd in nodes if nd.get("id") == c.get("toNodeId")), None)
                    if tgt_node:
                        tgt_labels.append(tgt_node.get("label", tgt_node.get("toolId", "input")))
                name = " → ".join(tgt_labels) if tgt_labels else n.get("label", "input")
            if cat in fabric:
                fabric[cat].append({"name": name, "protocol": "internal", "trigger": "event", "subtype": "raw_data", "direction": "in"})
            data_streams.append(f"IN:{cat}:{name}")
        elif tid == "data_out":
            cat = cfg.get("category", "data")
            name = cfg.get("name", "").strip()
            # Auto-name from connected source if name is empty
            if not name:
                incoming = [c for c in connections if c.get("toNodeId") == n["id"]]
                src_labels = []
                for c in incoming:
                    src_node = next((nd for nd in nodes if nd.get("id") == c.get("fromNodeId")), None)
                    if src_node:
                        src_labels.append(src_node.get("label", src_node.get("toolId", "output")))
                name = " → ".join(src_labels) if src_labels else n.get("label", "output")
            node_id = n["id"]
            if cat in fabric:
                fabric[cat].append({
                    "name": name, "protocol": "internal", "trigger": "event",
                    "subtype": "processed_data", "direction": "out",
                    "source_node_id": node_id,
                    "source_labels": [c.get("fromNodeId") for c in connections if c.get("toNodeId") == node_id],
                })
            data_streams.append(f"OUT:{cat}:{name}")
        elif tid.startswith("viz_") or tid.startswith("kpi_"):
            name = n.get("label", tid)
            fabric.setdefault("data", []).append({"name": name, "protocol": "internal", "trigger": "event", "subtype": "processed_data", "direction": "out"})
            data_streams.append(f"OUT:data:{name}")

    # Ensure at least a state port
    if not any(fabric[c] for c in fabric):
        fabric["state"].append({"name": f"state:{p.name}", "protocol": "internal", "trigger": "event", "subtype": "state", "direction": "out"})

    metadata = {
        "name": p.name,
        "domain": ["Process"],
        "status": "built",
        "process_type": "DES",
        "process_id": str(p.id),
        "sim_summary": {
            "throughput": summary.get("throughput"),
            "avg_cycle_time": summary.get("avg_time_in_system"),
            "entities_completed": summary.get("entities_completed"),
        },
        "node_count": len(nodes),
        "connection_count": len(canvas.get("connections", [])),
    }

    interfaces = {
        "api": "",
        "data_streams": data_streams,
        "fabric": fabric,
    }

    try:
        tw = _register_twin_in_dtr(twin_id, "demo", metadata, interfaces)
        ui = TwinUI.objects.filter(dtr_id=twin_id).first()
        if ui:
            AccessGrant.objects.get_or_create(user=request.user, twin=ui)
        p.status = "built"
        p.resulting_twin_id = twin_id
        p.save()
        return JsonResponse({
            "ok": True, "status": "built", "twin_id": twin_id,
            "message": f"Process '{p.name}' built and registered as twin {twin_id}",
        })
    except Exception as e:
        p.status = "failed"
        p.sim_log = f"Build error: {e}"
        p.save()
        return JsonResponse({"error": str(e)}, status=500)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def process_built_list(request):
    """List all built process models whose twin still exists in the registry."""
    from .models import Twin
    built = ProcessModel.objects.filter(status="built").order_by("-updated_at")
    results = []
    for p in built:
        # Only include if the twin still exists in DTR
        if p.resulting_twin_id and Twin.objects.filter(twin_id=p.resulting_twin_id).exists():
            results.append({
                "id": str(p.id),
                "name": p.name,
                "twin_id": p.resulting_twin_id,
                "node_count": len((p.canvas_state or {}).get("nodes", [])),
                "sim_summary": (p.sim_results or {}).get("summary", {}),
                "updated_at": p.updated_at.isoformat(),
            })
        elif p.resulting_twin_id:
            # Twin was deleted — reset process status so it can be re-built
            p.status = "completed"
            p.resulting_twin_id = None
            p.save(update_fields=["status", "resulting_twin_id"])
    return JsonResponse(results, safe=False)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def process_import_bpmn(request):
    """Parse a BPMN XML file and return process model nodes/connections."""
    f = request.FILES.get("file")
    if not f:
        # Try raw body
        xml_content = request.body.decode("utf-8", errors="replace")
        if not xml_content or '<' not in xml_content:
            return JsonResponse({"error": "No BPMN file provided"}, status=400)
    else:
        xml_content = f.read().decode("utf-8", errors="replace")

    try:
        result = _parse_bpmn(xml_content)
        return JsonResponse(result)
    except ET.ParseError as e:
        return JsonResponse({"error": f"Invalid XML: {e}"}, status=400)
    except Exception as e:
        return JsonResponse({"error": f"Parse error: {e}"}, status=500)
