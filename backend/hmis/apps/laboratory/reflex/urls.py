"""URL configuration for reflex testing module."""

from rest_framework.routers import DefaultRouter

from .views import ReflexExecutionViewSet, ReflexRuleViewSet

router = DefaultRouter()
router.register(r"rules", ReflexRuleViewSet, basename="reflex-rule")
router.register(r"executions", ReflexExecutionViewSet, basename="reflex-execution")

urlpatterns = router.urls
