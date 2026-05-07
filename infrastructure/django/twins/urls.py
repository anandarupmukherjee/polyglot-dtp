from django.urls import path
from .views import my_twins, RegistryTwinsRoot, RegistryTwinItem, registry_register_service, portal_stream, registry_list_twins_public, registry_list_services, registry_my_twins, registry_my_services, last_data_my, last_data_cached, healthz
from .registration_views import (
    register_twin, register_twin_upload, register_twin_guided,
    register_twin_status,
    register_templates_list, register_template_download,
    register_my_registrations,
    information_fabric, update_twin_fabric,
)
from .synthesis_views import (
    synthesis_tools, synthesis_list, synthesis_detail,
    synthesis_lock, synthesis_build, synthesis_status, synthesis_download,
    synthesis_preview,
)
from .process_views import (
    process_elements, process_list, process_detail,
    process_simulate, process_status, process_import_bpmn,
    process_lock_and_build, process_built_list,
)

urlpatterns = [
    path('me/twins/', my_twins),
    path('healthz', healthz),
    # Registry APIs
    path('registry/twins', RegistryTwinsRoot.as_view()),  # GET list, POST attach
    path('registry/public/twins', registry_list_twins_public),  # GET list (AllowAny)
    path('registry/my/twins', registry_my_twins),  # GET strict RBAC
    path('registry/twins/<str:twin_id>', RegistryTwinItem.as_view()),  # PATCH update, DELETE detach
    path('registry/services', registry_register_service),  # POST
    path('registry/services/list', registry_list_services),  # GET (RBAC-filtered)
    path('registry/my/services', registry_my_services),  # GET strict RBAC
    path('last-data/my', last_data_my),  # GET last data timestamps for my twins
    path('last-data/cached', last_data_cached),  # GET cached last data (server-side cron)
    # Portal SSE
    path('portal/stream', portal_stream),  # GET SSE
    # Twin Registration
    path('register/twin', register_twin),
    path('register/twin/upload', register_twin_upload),
    path('register/twin/guided', register_twin_guided),
    path('register/twin/<uuid:reg_id>/status', register_twin_status),
    path('register/twins', register_my_registrations),
    path('register/templates', register_templates_list),
    path('register/templates/<str:name>', register_template_download),
    # Information Fabric
    path('fabric', information_fabric),
    path('fabric/twin/<str:twin_id>', update_twin_fabric),
    # Twin Synthesis
    path('synthesis/', synthesis_list),
    path('synthesis/tools', synthesis_tools),
    path('synthesis/<uuid:synthesis_id>/', synthesis_detail),
    path('synthesis/<uuid:synthesis_id>/lock', synthesis_lock),
    path('synthesis/<uuid:synthesis_id>/build', synthesis_build),
    path('synthesis/<uuid:synthesis_id>/status', synthesis_status),
    path('synthesis/<uuid:synthesis_id>/download', synthesis_download),
    path('synthesis/preview', synthesis_preview),
    # Process Modelling
    path('process/elements', process_elements),
    path('process/built', process_built_list),
    path('process/import-bpmn', process_import_bpmn),
    path('process/', process_list),
    path('process/<uuid:process_id>/', process_detail),
    path('process/<uuid:process_id>/simulate', process_simulate),
    path('process/<uuid:process_id>/status', process_status),
    path('process/<uuid:process_id>/build', process_lock_and_build),
]

