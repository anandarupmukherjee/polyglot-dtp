from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import TwinUI, AccessGrant
from .serializers import TwinUISerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_twins(request):
    twin_ids = AccessGrant.objects.filter(user=request.user).values_list("twin_id", flat=True)
    twins = TwinUI.objects.filter(twin_id__in=twin_ids).order_by("name")
    return Response(TwinUISerializer(twins, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "is_staff": u.is_staff,
        "is_superuser": u.is_superuser,
    })
