from django.urls import path
from .views import my_twins, RegistryTwinsRoot, RegistryTwinItem, registry_register_service, portal_stream, registry_list_twins_public, registry_list_services, registry_my_twins, registry_my_services, last_data_my, last_data_cached, healthz

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
]

