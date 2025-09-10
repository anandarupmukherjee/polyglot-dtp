from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView
from twins import admin_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/", include("twins.urls")),
    # Simple admin API endpoints (JWT-protected, admin-only)
    path("api/admin/users", admin_views.users),
    path("api/admin/twins", admin_views.twins),
    path("api/admin/grants", admin_views.grants),
]
