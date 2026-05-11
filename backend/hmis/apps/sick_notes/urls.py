from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.sick_notes.views import SickNoteViewSet

app_name = "sick_notes"

router = DefaultRouter()
router.register(r"", SickNoteViewSet, basename="sicknote")

urlpatterns = [
    path("", include(router.urls)),
]
