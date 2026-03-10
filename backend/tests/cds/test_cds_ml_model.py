"""
Tests for the CDS engine ``ml_model`` evaluator type.

The ``ml_model`` evaluator checks cached ML prediction scores in
``context.extra["ml_predictions"]`` against a threshold.  This allows
TibaBot AI predictions (sepsis risk, ICU admission probability) to feed
into the CDS rule engine and generate ``CDSAlert`` records.

Tests cover:
- Rule triggers when score >= threshold
- Rule does not trigger when score < threshold
- Missing prediction gracefully skips
- Missing score_field gracefully skips
- Custom score_field support
- Details contain model metadata
- Message rendering with model variables
"""

import pytest  # type: ignore

from hmis.apps.cds.engine import EvaluationContext, EvaluationResult, evaluate_rule


class _MockRule:
    """Minimal mock CDSRule for engine tests."""

    def __init__(
        self,
        id: int = 1,
        code: str = "ML-001",
        condition: dict | None = None,
        action_message: str = "",
    ):
        self.id = id
        self.code = code
        self.condition = condition or {}
        self.action_message = action_message


class TestMLModelEvaluator:
    """Tests for _evaluate_ml_model via evaluate_rule."""

    def _make_context(self, ml_predictions: dict | None = None) -> EvaluationContext:
        """Create an EvaluationContext with ml_predictions."""
        ctx = EvaluationContext(patient_id=1, encounter_id=1)
        if ml_predictions is not None:
            ctx.extra["ml_predictions"] = ml_predictions
        return ctx

    def test_triggers_when_score_exceeds_threshold(self):
        """Rule should trigger when score >= threshold."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "sepsis_risk_v2",
                "threshold": 0.75,
                "score_field": "risk_score",
            },
            action_message="Sepsis risk score {score:.0%} exceeds threshold {threshold:.0%}",
        )
        context = self._make_context(
            ml_predictions={
                "sepsis_risk_v2": {
                    "risk_score": 0.87,
                    "risk_level": "high",
                },
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is True
        assert result.rule_code == "ML-001"
        assert result.details["model_name"] == "sepsis_risk_v2"
        assert result.details["score"] == 0.87
        assert result.details["threshold"] == 0.75

    def test_does_not_trigger_when_score_below_threshold(self):
        """Rule should not trigger when score < threshold."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "sepsis_risk_v2",
                "threshold": 0.75,
                "score_field": "risk_score",
            },
        )
        context = self._make_context(
            ml_predictions={
                "sepsis_risk_v2": {
                    "risk_score": 0.40,
                    "risk_level": "low",
                },
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is False

    def test_triggers_at_exact_threshold(self):
        """Rule should trigger when score == threshold."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "icu_admission_v1",
                "threshold": 0.5,
                "score_field": "risk_score",
            },
            action_message="ICU risk at threshold",
        )
        context = self._make_context(
            ml_predictions={
                "icu_admission_v1": {
                    "risk_score": 0.5,
                },
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is True

    def test_skips_when_no_predictions(self):
        """Rule should not trigger when no ml_predictions in context."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "sepsis_risk_v2",
                "threshold": 0.75,
            },
        )
        # No ml_predictions in extra
        context = self._make_context(ml_predictions=None)

        result = evaluate_rule(rule, context)
        assert result.triggered is False

    def test_skips_when_model_not_found(self):
        """Rule should not trigger when model_name not in predictions."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "nonexistent_model",
                "threshold": 0.5,
            },
        )
        context = self._make_context(
            ml_predictions={
                "sepsis_risk_v2": {"risk_score": 0.9},
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is False

    def test_skips_when_score_field_missing(self):
        """Rule should not trigger when score_field not in prediction."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "sepsis_risk_v2",
                "threshold": 0.5,
                "score_field": "missing_field",
            },
        )
        context = self._make_context(
            ml_predictions={
                "sepsis_risk_v2": {"risk_score": 0.9},
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is False

    def test_default_score_field_is_risk_score(self):
        """Should use 'risk_score' as default score_field."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "icu_v1",
                "threshold": 0.6,
                # no score_field specified
            },
            action_message="Alert: {score}",
        )
        context = self._make_context(
            ml_predictions={
                "icu_v1": {"risk_score": 0.8},
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is True
        assert result.details["score_field"] == "risk_score"

    def test_custom_score_field(self):
        """Should use custom score_field when specified."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "aki_predictor",
                "threshold": 0.7,
                "score_field": "aki_probability",
            },
            action_message="AKI risk: {score}",
        )
        context = self._make_context(
            ml_predictions={
                "aki_predictor": {
                    "risk_score": 0.3,  # Below threshold
                    "aki_probability": 0.85,  # Above threshold
                },
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is True
        assert result.details["score"] == 0.85

    def test_details_contain_model_metadata(self):
        """Result details should include model name, score, threshold, risk_level."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "deterioration_v3",
                "threshold": 0.5,
                "score_field": "risk_score",
                "input_features": ["temperature", "pulse", "spo2"],
            },
            action_message="Deterioration alert",
        )
        context = self._make_context(
            ml_predictions={
                "deterioration_v3": {
                    "risk_score": 0.72,
                    "risk_level": "high",
                },
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is True
        assert result.details["model_name"] == "deterioration_v3"
        assert result.details["score"] == 0.72
        assert result.details["threshold"] == 0.5
        assert result.details["risk_level"] == "high"
        assert result.details["input_features"] == ["temperature", "pulse", "spo2"]

    def test_missing_model_name_does_not_trigger(self):
        """Rule with empty model_name should not trigger."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "",
                "threshold": 0.5,
            },
        )
        context = self._make_context(
            ml_predictions={"some_model": {"risk_score": 0.9}}
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is False

    def test_message_rendering_with_model_variables(self):
        """Action message should render with model variables."""
        rule = _MockRule(
            condition={
                "type": "ml_model",
                "model_name": "sepsis_v2",
                "threshold": 0.75,
                "score_field": "risk_score",
            },
            action_message="ML alert: {model_name} score {score} >= {threshold}",
        )
        context = self._make_context(
            ml_predictions={
                "sepsis_v2": {"risk_score": 0.88, "risk_level": "critical"},
            }
        )

        result = evaluate_rule(rule, context)
        assert result.triggered is True
        assert "sepsis_v2" in result.message
        assert "0.88" in result.message
        assert "0.75" in result.message
