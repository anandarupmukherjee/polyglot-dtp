from django.urls import path
from .views import my_twins

urlpatterns = [
    path('me/twins/', my_twins),
]

