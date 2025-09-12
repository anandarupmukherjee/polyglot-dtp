from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from .models import TwinUI, AccessGrant
from .serializers import TwinUISerializer


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdminUser])
def users(request):
    if request.method == "GET":
        data = [
            {"id": u.id, "username": u.username, "email": u.email, "is_staff": u.is_staff}
            for u in User.objects.all().order_by("username")
        ]
        return Response(data)
    if request.method == "POST":
        # create user {username,email,password}
        payload = request.data or {}
        username = payload.get("username")
        email = payload.get("email", username)
        password = payload.get("password")
        if not username or not password:
            return Response({"detail": "username and password required"}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "user exists"}, status=status.HTTP_409_CONFLICT)
        u = User.objects.create_user(username=username, email=email, password=password)
        return Response({"id": u.id, "username": u.username, "email": u.email}, status=status.HTTP_201_CREATED)
    # DELETE user {username}
    username = (request.data or {}).get("username")
    if not username:
        return Response({"detail": "username required"}, status=status.HTTP_400_BAD_REQUEST)
    if request.user.username == username:
        return Response({"detail": "cannot delete self"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        User.objects.get(username=username).delete()
        return Response({"ok": True})
    except User.DoesNotExist:
        return Response({"detail": "user not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdminUser])
def twins(request):
    if request.method == "GET":
        items = TwinUI.objects.all().order_by("name")
        return Response(TwinUISerializer(items, many=True).data)
    if request.method == "POST":
        # create twin {name, ui_url, dtr_id?}
        name = request.data.get("name")
        ui_url = request.data.get("ui_url")
        dtr_id = request.data.get("dtr_id")
        if not name or not ui_url:
            return Response({"detail": "name and ui_url required"}, status=status.HTTP_400_BAD_REQUEST)
        tw = TwinUI.objects.create(name=name, ui_url=ui_url, dtr_id=dtr_id)
        return Response(TwinUISerializer(tw).data, status=status.HTTP_201_CREATED)
    # DELETE twin {twin_id}
    twin_id = request.data.get("twin_id")
    if not twin_id:
        return Response({"detail": "twin_id required"}, status=status.HTTP_400_BAD_REQUEST)
    deleted, _ = TwinUI.objects.filter(pk=twin_id).delete()
    if deleted:
        return Response({"ok": True})
    return Response({"detail": "twin not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAdminUser])
def grants(request):
    if request.method == "GET":
        data = [
            {"user": g.user.username, "twin_id": str(g.twin.twin_id), "twin": g.twin.name}
            for g in AccessGrant.objects.select_related("user", "twin").all()
        ]
        return Response(data)
    if request.method == "POST":
        # grant {username, twin_id}
        username = request.data.get("username")
        twin_id = request.data.get("twin_id")
        if not username or not twin_id:
            return Response({"detail": "username and twin_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            u = User.objects.get(username=username)
            t = TwinUI.objects.get(pk=twin_id)
        except (User.DoesNotExist, TwinUI.DoesNotExist):
            return Response({"detail": "user or twin not found"}, status=status.HTTP_404_NOT_FOUND)
        AccessGrant.objects.get_or_create(user=u, twin=t)
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
    # DELETE grant {username, twin_id}
    username = request.data.get("username")
    twin_id = request.data.get("twin_id")
    if not username or not twin_id:
        return Response({"detail": "username and twin_id required"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        u = User.objects.get(username=username)
        t = TwinUI.objects.get(pk=twin_id)
    except (User.DoesNotExist, TwinUI.DoesNotExist):
        return Response({"detail": "user or twin not found"}, status=status.HTTP_404_NOT_FOUND)
    deleted, _ = AccessGrant.objects.filter(user=u, twin=t).delete()
    if deleted:
        return Response({"ok": True})
    return Response({"detail": "grant not found"}, status=status.HTTP_404_NOT_FOUND)
