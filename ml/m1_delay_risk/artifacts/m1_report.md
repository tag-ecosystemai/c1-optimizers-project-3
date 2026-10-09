# M1 Delay Model Report

Model version: `m1-gradient_boosting-random_forest-20261008`

## Setup
Time-based split on order date. Train to 2017-05-31 (144,748 rows), validation to 2017-08-31 (14,893), test after that (13,124). Champions were chosen on validation only. Cancelled and suspected-fraud orders are excluded.

**Limitation:** the test period only contains these markets: Europe (7,744), Pacific Asia (5,380). Results say nothing about the other markets.

## Regression (days of delay)
| Model | Val MAE | Test MAE | Test RMSE | Test R2 | Type |
|---|---|---|---|---|---|
| mean_predictor | 1.208 | 1.207 | 1.498 | -0.000 | baseline |
| shipping_mode_only | 0.984 | 0.981 | 1.268 | 0.283 | baseline |
| linear_regression | 1.149 | 1.141 | 1.427 | 0.092 | model |
| random_forest | 0.989 | 0.989 | 1.270 | 0.281 | model |
| gradient_boosting (champion) | 0.984 | 0.985 | 1.274 | 0.277 | model |
| xgboost | 0.993 | 0.994 | 1.271 | 0.280 | model |

## Classification (late or not)
| Model | Val AUC | Test AUC | Test PR-AUC | Test F1 | Type |
|---|---|---|---|---|---|
| mean_predictor | 0.500 | 0.500 | 0.573 | 0.729 | baseline |
| shipping_mode_only | 0.744 | 0.748 | 0.787 | 0.729 | baseline |
| logistic_regression | 0.715 | 0.726 | 0.752 | 0.729 | model |
| random_forest (champion) | 0.747 | 0.749 | 0.838 | 0.729 | model |
| gradient_boosting | 0.742 | 0.745 | 0.836 | 0.729 | model |
| xgboost | 0.740 | 0.744 | 0.835 | 0.729 | model |

Champion classifier at threshold 0.38: TN 12, FP 5,589, FN 5, TP 7,518; Brier score 0.190.

## Does the model beat the shipping-mode-only baseline?
Test MAE improvement over the baseline: -0.004 days. Test AUC improvement: +0.001. If these are close to zero, say so plainly: the other features add little beyond shipping mode.

## Ablation
Without order_item_total, profit_ratio: test MAE 0.984, test AUC 0.746. If these barely change, those two features are not carrying the model.

## Test results by shipping mode
| Shipping mode | Orders | Actual late rate | Model MAE | Mode-baseline MAE | AUC |
|---|---|---|---|---|---|
| First Class | 1982 | 1.000 | 0.000 | 0.000 | n/a |
| Same Day | 705 | 0.567 | 0.574 | 0.505 | 0.483 |
| Second Class | 2594 | 0.801 | 1.196 | 1.195 | 0.498 |
| Standard Class | 7843 | 0.391 | 1.201 | 1.201 | 0.504 |

## Test results by market
| Market | Orders | Actual late rate | Model MAE | Mode-baseline MAE | AUC |
|---|---|---|---|---|---|
| Europe | 7744 | 0.569 | 0.986 | 0.982 | 0.752 |
| Pacific Asia | 5380 | 0.580 | 0.983 | 0.980 | 0.744 |
