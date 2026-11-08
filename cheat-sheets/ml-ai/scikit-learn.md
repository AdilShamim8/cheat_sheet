# scikit-learn

**Category:** ML / AI · **Tier:** ML / AI · **Tags:** classical-ml, supervised, unsupervised, preprocessing, pipelines, numpy, python, inria · **First released:** 2007 · **Author:** Inria / Community (David Cournapeau, Fabian Pedregosa) · **Last updated:** 2026-11

> Uniform fit/predict interface for classical ML — the default for tabular data, baselines, and preprocessing pipelines.

---

## TL;DR

- scikit-learn is a Python library of classical ML algorithms — linear models, tree ensembles, SVMs, clustering, dimensionality reduction — all behind one fit/predict/transform interface.
- It is the default for tabular data, baselines before deep learning, and any 'small data' problem (under ~1M rows) where interpretable models beat black boxes.
- Reach for it for regression/classification on tabular features, preprocessing pipelines (scaling, encoding, imputation), and model selection (cross-validation, grid search).
- Avoid it for deep learning (PyTorch/TF), for data larger than RAM (use Dask-ML, Spark MLlib, or cuML on GPU), or for production serving at high QPS (export via ONNX or use a dedicated inference server).

## Core Mental Model

**Every algorithm is an Estimator with fit() and predict().** An Estimator is any object that learns from data via .fit(X, [y]) and stores what it learned in attributes ending with a trailing underscore (e.g. model.coef_, model.classes_). Predictors add .predict(X) and .score(X, y); Transformers add .transform(X) — and .fit_transform() is often a faster fused call. Because every algorithm shares this contract, sklearn.compose.Pipeline can chain preprocessing + model into one fit/predict unit, and GridSearchCV can tune any estimator's hyperparameters with the same code.

## Must-Know Constructs

| Syntax | Behavior | When to use |
| --- | --- | --- |
| estimator.fit(X, y) | Learns parameters from data — stores them as attributes ending in underscore (coef_, classes_, feature_importances_). | Always — the entry point. Trailing-underscore attributes exist ONLY after fit(). |
| estimator.predict(X) | Returns predicted labels (classification) or values (regression) for new samples. | Inference. Use predict_proba for class probabilities, decision_function for raw scores. |
| transformer.fit_transform(X) | Fits the transformer and applies it in one optimized call — not always equal to fit().transform(). | Preprocessing in pipelines. For Tf-idf and PCA, fit_transform is meaningfully faster than separate calls. |
| estimator.score(X, y) | Returns R² (regression) or accuracy (classification) — the default metric for the model type. | Quick sanity check. Use cross_val_score or a dedicated metric for any real evaluation. |
| Pipeline([('scaler', StandardScaler()), ('clf', LogisticRegression())]) | Chains transformers + final estimator — fit/predict cascade through each step; no leakage possible. | Always wrap preprocessing + model. Direct concatenation leaks test-set statistics into training. |
| ColumnTransformer([('num', StandardScaler(), num_cols), ('cat', OneHotEncoder(), cat_cols)]) | Applies different transformers to different columns, concatenates results. | Mixed-type tabular data — the modern replacement for manual dtype handling and DataFrameMapper. |
| GridSearchCV(est, param_grid, cv=5, scoring='f1', n_jobs=-1) | Exhaustive search over a parameter grid with k-fold CV — refits the best model on all data by default. | Tuning a small number of hyperparameters. Switch to RandomizedSearchCV when the grid is large. |
| cross_val_score(est, X, y, cv=StratifiedKFold(5)) | Returns an array of k scores from k-fold cross-validation — StratifiedKFold preserves class balance. | Honest model comparison. Use cross_validate for multiple metrics and fit times. |
| train_test_split(X, y, test_size=0.2, stratify=y, random_state=42) | Splits into train/test sets — stratify keeps class proportions identical in both halves. | Hold-out evaluation. Always pass random_state for reproducibility; always pass stratify for imbalanced classification. |
| joblib.dump(est, 'model.joblib', compress=3); joblib.load('model.joblib') | Pickle-serializes the estimator (and its fitted state) to disk — compress=3 gives ~10× smaller files. | Persisting trained models. Do NOT use pickle directly — joblib handles NumPy arrays efficiently. |
| sklearn.set_config(transform_output='pandas') | All transformers return pandas DataFrames (with named columns) instead of NumPy arrays — global toggle since 1.2. | Inspecting intermediate pipeline stages, debugging feature names, downstream pandas code. |
| HistGradientBoostingClassifier(...) | Native histogram-based gradient boosting — 10–100× faster than GradientBoostingClassifier, supports NaN natively. | Tabular baselines; the sklearn-native answer to LightGBM/XGBoost (still slower than those but no extra dependency). |

## Idiomatic Patterns

**Pipeline + ColumnTransformer — the canonical tabular preprocessing recipe**

```python
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression

num_cols = ["age", "income", "score"]
cat_cols = ["city", "plan"]

pre = ColumnTransformer([
    ("num", Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale",  StandardScaler()),
    ]), num_cols),
    ("cat", Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ]), cat_cols),
])

clf = Pipeline([("pre", pre),
                ("clf", LogisticRegression(max_iter=1000, class_weight="balanced"))])

# fit / predict / score all flow through the pipeline — no leakage
clf.fit(X_train, y_train)
print(clf.score(X_test, y_test))
```

**GridSearchCV with a Pipeline — tune preprocessor AND model together**

```python
from sklearn.model_selection import GridSearchCV
from sklearn.ensemble import RandomForestClassifier

pipe = Pipeline([("pre", pre),                    # ColumnTransformer from above
                 ("clf", RandomForestClassifier(random_state=42, n_jobs=-1))])

param_grid = [
    {"clf__n_estimators":    [200, 500],
     "clf__max_depth":       [None, 10, 20],
     "clf__min_samples_leaf":[1, 5],
     "pre__num__impute__strategy": ["median", "mean"]},
]

search = GridSearchCV(pipe, param_grid, cv=5,
                      scoring="roc_auc", n_jobs=-1, verbose=1, refit=True)
search.fit(X_train, y_train)
print(search.best_params_, search.best_score_)
# search.best_estimator_ is the refit pipeline — ready to use directly
```

**Custom Transformer that slots into any Pipeline**

```python
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.utils.validation import check_is_fitted
import numpy as np

class LogTransformer(BaseEstimator, TransformerMixin):
    """log1p-transform specified numeric columns, leave others alone."""
    def __init__(self, columns: list[str] | None = None):
        self.columns = columns

    def fit(self, X, y=None):
        self.columns_ = self.columns if self.columns is not None else X.columns.tolist()
        self.feature_names_in_ = np.asarray(X.columns, dtype=object)
        return self

    def transform(self, X):
        check_is_fitted(self)
        X = X.copy()
        X[self.columns_] = np.log1p(X[self.columns_])
        return X

    def get_feature_names_out(self, input_features=None):
        return self.feature_names_in_

# Now usable in any Pipeline: Pipeline([('log', LogTransformer(['income'])), ...])
```

**Cross-validation with multiple metrics + threshold tuning**

```python
from sklearn.model_selection import cross_validate, StratifiedKFold
from sklearn.metrics import make_scorer, f1_score, roc_auc_score

scoring = {
    "f1":  make_scorer(f1_score, pos_label=1),
    "auc": "roc_auc",
    "acc": "accuracy",
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
results = cross_validate(clf, X, y, cv=cv, scoring=scoring,
                         return_train_score=True, n_jobs=-1)

for k in results:
    if k.startswith("test_"):
        print(f"{k:10s} {results[k].mean():.4f} ± {results[k].std():.4f}")
# Compare clf A vs clf B on the SAME folds by passing cv.split(X, y) explicitly
```

**Save/load with joblib + version check — production-safe pattern**

```python
import joblib, sklearn, numpy as np

# Save the FULL pipeline (preprocessing + model) plus metadata
artifact = {
    "pipeline":   clf,                          # the fitted Pipeline
    "sklearn_version": sklearn.__version__,
    "feature_names":   X_train.columns.tolist(),
    "classes":         clf.classes_.tolist(),
}
joblib.dump(artifact, "model.joblib", compress=3)

# Load — assert version compatibility BEFORE serving
loaded = joblib.load("model.joblib")
assert loaded["sklearn_version"] == sklearn.__version__, \
    f"trained on {loaded['sklearn_version']}, running {sklearn.__version__}"
clf = loaded["pipeline"]
preds = clf.predict(new_data[loaded["feature_names"]])
```

## Common Pitfalls

1. **Data leakage — fitting scaler before train/test split** — *Symptom:* Cross-validation scores look great, but real test performance is much worse — the scaler has seen the test set's mean/std. *Fix:* Always put preprocessing INSIDE a Pipeline. cross_val_score and GridSearchCV will call fit() only on the train fold and transform() on the test fold, preventing leakage. Never call fit_transform on the full dataset.
2. **Using fit_transform on test data** — *Symptom:* Test metrics are garbage because the transformer was re-fit on test, throwing away the training-time mapping (e.g. OneHotEncoder now sees different categories). *Fix:* Call .fit() (or .fit_transform()) only on train. On test, call ONLY .transform(). With a Pipeline this is automatic — .predict() never re-fits transformers.
3. **n_jobs=-1 nested in GridSearchCV causes CPU oversubscription** — *Symptom:* Training is slower than expected; CPU usage is pinned at 100% across all cores but throughput is poor — too many processes contending. *Fix:* Pick ONE level to parallelize. If GridSearchCV(n_jobs=-1) over k folds, set the inner estimator's n_jobs=1. With 8 cores: either outer n_jobs=8, inner=1, or outer=1, inner=8 — never both at -1.
4. **Loading a joblib model across sklearn versions fails silently** — *Symptom:* joblib.load() raises AttributeError on a missing attribute, or worse, the model loads but produces subtly wrong predictions — internal class structure changed between versions. *Fix:* Pin sklearn version in production to match training. Store sklearn.__version__ alongside the model (see pattern above) and assert on load. For long-lived artifacts, export to ONNX via skl2onnx.
5. **predict() returns labels, predict_proba() returns probabilities** — *Symptom:* Code that expected probabilities gets integer labels and computes a meaningless AUC of 0.5; or code that expected labels gets a 2D array and crashes. *Fix:* Use predict() for hard class labels (0/1), predict_proba() for [n_samples, n_classes] of probabilities, and decision_function() for raw signed scores (SVMs, linear models). Not every estimator supports all three — check the docs.
6. **OneHotEncoder on unknown categories at test time** — *Symptom:* ValueError: 'Found unknown categories' in production — a test sample has a category value not seen during fit (new city, new user agent). *Fix:* Always pass OneHotEncoder(handle_unknown='ignore'). For OrdinalEncoder, use handle_unknown='use_encoded_value' with unknown_value=-1. This is a production-readiness requirement, not optional.
7. **Sparse vs dense matrix confusion** — *Symptom:* Memory explodes after OneHotEncoder (10M rows × 10k categories → 80 GB dense); or a model that requires dense crashes on a sparse input. *Fix:* OneHotEncoder returns sparse by default — keep it that way for tree models and linear models (they handle sparse natively). Call .toarray() only when a model genuinely requires dense (e.g. some clustering). For large sparse data, prefer HistGradientBoosting over k-NN or KMeans.

## Production / Interview Quick Reference

- scikit-learn 1.9.1 (Sep 2026) — Callback API (ProgressBar/ScoringMonitor) and narwhals dataframe interop. `version`
- Trailing-underscore attributes (coef_, classes_, feature_importances_) exist ONLY after fit() — accessing them before raises AttributeError. `gotcha`
- fit_transform() is not always == fit().transform(): Tf-idf and PCA have a faster fused path; for those, always use fit_transform on train. `perf`
- Pipeline caches nothing by default — set memory='/tmp' to cache transformers across GridSearchCV iterations (huge speedup when preprocessing is expensive). `perf`
- HistGradientBoostingClassifier is 10–100× faster than GradientBoostingClassifier, handles NaN natively, and is the sklearn-native LightGBM alternative. `perf`
- GridSearchCV exhausts the grid (k^d combinations); RandomizedSearchCV samples n_iter — for d>3 hyperparameters, RandomizedSearchCV wins almost always. `complexity`
- Default CV: StratifiedKFold(5) for classification, KFold(5) for regression. Pass cv=an integer to cross_val_score to use the defaults. `version`
- StandardScaler: mean=0, std=1 — sensitive to outliers. Use RobustScaler (median + IQR) for outlier-heavy data, or QuantileTransformer for severe skew. `gotcha`
- OneHotEncoder(handle_unknown='ignore') is mandatory for production — without it, a new category at inference crashes the pipeline. `gotcha`
- PCA(n_components=0.95) keeps enough components to explain 95% of variance — a one-line dimensionality reducer. `complexity`
- Most sklearn algorithms are O(n_samples × n_features × n_iterations) — tree ensembles scale ~linearly in samples, k-NN is O(n_samples) at predict time. `complexity`
- RandomForest n_jobs=-1 uses all cores; HistGradientBoosting does NOT parallelize across samples (only across features). Pick the right one for your bottleneck. `perf`
- class_weight='balanced' auto-scales loss by inverse class frequency — the cheapest fix for imbalanced classification, often beats resampling. `gotcha`
- joblib.compress=3 → ~10× smaller files at ~10% slower load; compress=0 is fastest. Pick based on whether you're I/O- or CPU-bound at deploy. `perf`
- sklearn 1.4+ supports missing values natively in HistGradientBoosting; most other estimators raise on NaN — use SimpleImputer in the pipeline. `version`
- set_config(transform_output='pandas') (1.2+) makes every transformer return a DataFrame — invaluable for debugging pipelines and getting feature names out. `version`

## Go Deeper

- [scikit-learn Official Documentation](https://scikit-learn.org/stable/) — The User Guide section is canonical — read 'Pipeline and composite estimators', 'Tuning the hyper-parameters', and 'Common pitfalls in choosing ML estimators'.
- [Scikit-learn: Machine Learning in Python (Pedregosa et al., JMLR 2011)](https://jmlr.csail.mit.edu/papers/v12/pedregosa11a.html) — The original paper — defines the fit/predict/transform API contract every other Python ML library imitates.
- [Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow (Aurélien Géron)](https://www.oreilly.com/library/view/hands-on-machine-learning/9781098125967/) — Chapters 1–9 are the most-used sklearn tutorial in industry; chapters 2–4 cover the end-to-end project pipeline.
- [scikit-learn MOOC (Inria)](https://www.fun-mooc.fr/en/courses/machine-learning-python-scikit-learn/) — Free, official course from Inria (sklearn's home institution) — best structured path from basics to advanced pipelines.
- [API design for machine learning software (Buitinck et al., 2013)](https://arxiv.org/abs/1309.0238) — The design paper explaining why the estimator API is the way it is — required reading for anyone building ML libraries.

## Data Types Deep Dive

### Primitives

| Syntax | Behavior | When to use |
| --- | --- | --- |
| np.float64 (default) | 64-bit IEEE float — sklearn's default input dtype; robust for training, slow for inference. | Default for most estimators. Switch to float32 only for memory-constrained inference. |
| np.float32 | 32-bit float — half the memory, ~2x faster on SIMD for some estimators. | Large datasets, GPU-bound libraries (cuML), or when sklearn is called from a deep-learning pipeline. |
| np.int64 / np.int32 | Signed integer — for class labels, feature indices, sample counts. | Classification targets default to int64; integer-encoded categorical features. |
| np.bool_ | Boolean — for masks and binary indicators (e.g. OneHotEncoder(sparse_output=False) > 0). | Masking rows, indicating presence/absence of features. |
| object dtype | Python object array — heterogeneously typed, used for strings and mixed columns. | Raw text columns, mixed-type pandas columns before preprocessing. |
| pd.Categorical | Pandas categorical dtype — efficient integer-backed string storage. | Low-cardinality categorical columns; OneHotEncoder handles it natively. |
| pd.SparseDtype | Sparse storage dtype — only non-zero values stored. | Bag-of-words features; rare categorical features. |
| str / bytes (text) | String features — handled by TextVectorization / TfidfVectorizer, not by most estimators directly. | NLP pipelines; CountVectorizer/TfidfVectorizer accept raw text. |

### Collections

| Syntax | Behavior | When to use |
| --- | --- | --- |
| np.ndarray (2-D) | Dense matrix — shape (n_samples, n_features). The canonical input shape. | Default input to every estimator. Use .values to get from a DataFrame. |
| scipy.sparse.csr_matrix | Compressed sparse row — efficient for many-zero matrices. | Output of OneHotEncoder, TfidfVectorizer. Most linear/tree estimators accept it. |
| scipy.sparse.csc_matrix | Compressed sparse column — efficient for column slicing. | When you slice features often; rare in sklearn input paths. |
| pd.DataFrame | Tabular structure with named columns and dtype-aware access. | Inspecting data, debugging pipelines; set_config(transform_output='pandas') keeps it through transformers. |
| pd.Series | 1-D labeled array — typically the target vector y. | Targets and single-feature inputs. Index is preserved through fit/predict. |
| dict / Bunch | Dict-like — sklearn.datasets returns Bunch (dict subclass with attribute access). | Loading toy datasets; metadata around fitted estimators. |
| sklearn.utils.Bunch | Internal container — like a dict but with attribute access (e.g. data.target). | Returned by load_iris(), load_digits(), and similar dataset loaders. |
| np.ma.MaskedArray | Array with a boolean mask — used internally for missing data. | Rarely user-facing; SimpleImputer converts to NaN internally instead. |

### Custom types

| Syntax | Behavior | When to use |
| --- | --- | --- |
| class Estimator(BaseEstimator): | Base class — provides get_params/set_params (clone, GridSearch compatibility). | Any custom estimator. Inherit from BaseEstimator + the right mixin. |
| class Clf(ClassifierMixin, BaseEstimator):   def fit(self, X, y): ...   def predict(self, X): ... | Custom classifier — ClassifierMixin adds .score() (accuracy) and _estimator_type. | Custom models intended for GridSearchCV/cross_val_score/pipelines. |
| class Reg(RegressorMixin, BaseEstimator): | Custom regressor — RegressorMixin sets .score() to R². | Custom regression models. |
| class T(TransformerMixin, BaseEstimator):   def fit(self, X): ...   def transform(self, X): ... | Custom transformer — TransformerMixin adds fit_transform (calls fit then transform). | Custom preprocessing steps that slot into Pipeline. |
| class T(BaseEstimator):   def fit_transform(self, X, y=None): ... | Override fit_transform directly for fused fast paths (PCA, TfidfVectorizer). | When fit + transform can be optimized together; subclass TransformerMixin still for the default fallback. |
| Pipeline([('name', est), ...]) | Linear chain of transformers + final estimator — fit/predict cascade through each step. | Always wrap preprocessing + model. Direct concatenation leaks test-set stats. |
| ColumnTransformer([('name', transformer, cols), ...]) | Applies different transformers to different columns, concatenates results. | Mixed-type tabular data; the modern replacement for manual dtype handling. |
| FeatureUnion([('name', transformer), ...]) | Applies transformers in parallel and concatenates their outputs side-by-side. | Combining feature sets (e.g. PCA + select-k-best into one model input). |

## Operators & Expressions

| Syntax | Behavior | When to use |
| --- | --- | --- |
| X[train_idx], X[test_idx] | Boolean or integer mask indexing — selects rows; the workhorse for splits. | Manual train/test splits, CV folds. Use sklearn.model_selection instead of doing it by hand. |
| X[:, col_idx] | Column selection — by integer index, slice, or boolean mask. | Selecting feature subsets; ColumnTransformer does this for you declaratively. |
| X @ w | Matrix multiply — NumPy operator on dense; scipy.sparse uses .dot(). | Linear model scoring; sklearn calls BLAS internally so you rarely do this. |
| np.hstack([X1, X2]) / np.vstack([X1, X2]) | Horizontal/vertical stack — for manual feature concatenation. | Avoid in pipelines — use FeatureUnion or ColumnTransformer for declarative concatenation. |
| scipy.sparse.hstack([X1, X2]) | Sparse horizontal stack — preserves sparsity. | Concatenating sparse features after multiple vectorizers; sklearn's FeatureUnion uses this internally. |
| (X > threshold).astype(int) | Threshold-based binarization. | Quick feature engineering; in production use Binarizer(threshold=...). |
| np.where(cond, a, b) | Element-wise ternary — picks from a where cond is True. | Conditional feature engineering, label correction. |
| est.fit(X, y) -> est | The central op — learns from data, returns self for chaining. | Always. Side-effect: trailing-underscore attributes (coef_, classes_) are set on est. |
| est.predict(X) -> ndarray | Apply learned model to new data — returns labels (clf) or values (reg). | Inference. For probabilities use predict_proba, for raw scores use decision_function. |
| est.transform(X) -> ndarray | Apply learned transformation — output shape may differ from input. | Preprocessing pipelines; PCA, StandardScaler, OneHotEncoder all use this contract. |
| est.fit_transform(X, y) -> ndarray | Fused fit + transform — often faster than separate calls (PCA, TfidfVectorizer). | Always on TRAINING data; on test data use only .transform() to avoid leakage. |
| pipe.fit(X, y) / pipe.predict(X) | Pipeline dispatches to each step in order — transformers fit_transform, final estimator fit. | Standard supervised workflow; everything inside a Pipeline flows through fit/predict. |
| cross_val_score(est, X, y, cv=5) | Runs k-fold CV — fits on k-1 folds, scores on the held-out fold, returns array of k scores. | Honest model comparison. Pass cv=StratifiedKFold for classification. |
| est.score(X, y) -> float | Default metric: accuracy (ClassifierMixin) or R² (RegressorMixin). | Quick sanity check. Use a dedicated metric (roc_auc_score, f1_score) for real evaluation. |

## Input / Output

**Save/load with joblib + version check — production-safe pattern**

```python
import joblib, sklearn, numpy as np

# Save the FULL pipeline (preprocessing + model) plus metadata
artifact = {
    "pipeline":   clf,                          # the fitted Pipeline
    "sklearn_version": sklearn.__version__,
    "feature_names":   X_train.columns.tolist(),
    "classes":         clf.classes_.tolist(),
}
joblib.dump(artifact, "model.joblib", compress=3)

# Load — assert version compatibility BEFORE serving
loaded = joblib.load("model.joblib")
assert loaded["sklearn_version"] == sklearn.__version__, \
    f"trained on {loaded['sklearn_version']}, running {sklearn.__version__}"
clf = loaded["pipeline"]
preds = clf.predict(new_data[loaded["feature_names"]])
```

**Loading common dataset formats — CSV, parquet, HDF5**

```python
import pandas as pd
from sklearn.datasets import load_iris, fetch_openml

# Built-in toy datasets — fast, in-memory, no network
iris = load_iris(as_frame=True)
X, y = iris.data, iris.target

# OpenML — fetch from public ML dataset hub
X, y = fetch_openml("titanic", version=1, as_frame=True, return_X_y=True)

# CSV — pandas reads; pass DataFrame to Pipeline (ColumnTransformer keeps names)
df = pd.read_csv("data.csv", dtype={"id": str, "amount": float})

# Parquet — columnar, much faster than CSV for >100MB
df = pd.read_parquet("data.parquet")

# HDF5 — for very large tabular data with random access
df = pd.read_hdf("data.h5", key="table", where="date > '2024-01-01'")
```

**Export to ONNX for cross-language production serving**

```python
from skl2onnx import to_onnx
import onnxruntime as rt

# Convert the full Pipeline (preprocessing + model) to ONNX
onx = to_onnx(clf, X_train[:1].astype("float32"),
              target_opset=17,
              options={id(clf): {"zipmap": False}})  # raw logits, not dict
open("model.onnx", "wb").write(onx.SerializeToString())

# Serve from any language with onnxruntime (C#/Java/JS/Python)
sess = rt.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
input_name = sess.get_inputs()[0].name
pred = sess.run(None, {input_name: X_test[:5].astype("float32")})
print(pred[0])                              # array of predicted labels
```

**Streaming from disk with partial_fit — for data larger than RAM**

```python
from sklearn.linear_model import SGDClassifier
import pandas as pd

# Estimators that support partial_fit can be trained on chunks
clf = SGDClassifier(loss="log_loss", random_state=42)
classes = [0, 1, 2]

# Iterate through chunks from disk
for chunk in pd.read_csv("huge.csv", chunksize=100_000):
    X = chunk.drop(columns=["target"])
    y = chunk["target"]
    clf.partial_fit(X, y, classes=classes)

# Supports: SGDClassifier/Regressor, Perceptron, PassiveAggressive,
# MultinomialNB, BernoulliNB, MiniBatchKMeans, MLPClassifier
```

## Loops & Iteration

**Cross-validation loop with stratified k-fold + per-fold metrics**

```python
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score
import numpy as np

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
oof = np.zeros(len(X))                      # out-of-fold predictions

for fold, (tr, va) in enumerate(skf.split(X, y)):
    model = build_model()                   # fresh clone each fold
    model.fit(X.iloc[tr], y.iloc[tr])
    oof[va] = model.predict_proba(X.iloc[va])[:, 1]
    print(f"fold {fold}: AUC = {roc_auc_score(y.iloc[va], oof[va]):.4f}")

print(f"OOF AUC: {roc_auc_score(y, oof):.4f}")
# OOF predictions are also used for stacking (level-1 model inputs)
```

**GridSearchCV — the canonical hyperparameter loop (used declaratively)**

```python
from sklearn.model_selection import GridSearchCV
from sklearn.ensemble import RandomForestClassifier

pipe = Pipeline([("pre", pre),
                 ("clf", RandomForestClassifier(random_state=42, n_jobs=-1))])

param_grid = [
    {"clf__n_estimators":     [200, 500],
     "clf__max_depth":        [None, 10, 20],
     "clf__min_samples_leaf": [1, 5],
     "pre__num__impute__strategy": ["median", "mean"]},
]

search = GridSearchCV(pipe, param_grid, cv=5, scoring="roc_auc",
                      n_jobs=-1, verbose=1, refit=True, return_train_score=True)
search.fit(X_train, y_train)
print(search.best_params_, search.best_score_)
# search.best_estimator_ is the refit pipeline — ready to use directly
```

**Iterative imputation + chained equation loop (MICE-style)**

```python
from sklearn.experimental import enable_iterative_imputer  # noqa
from sklearn.impute import IterativeImputer
from sklearn.linear_model import BayesianRidge

# IterativeImputer models each feature with missing values as a function of others
# It loops: round 1 uses initial imputation, round N uses predictions from round N-1.
imp = IterativeImputer(
    estimator=BayesianRidge(),
    max_iter=10,                  # number of inner iterations
    sample_posterior=True,        # for multiple imputations, set random_state per run
    random_state=42,
)
X_filled = imp.fit_transform(X_missing)
# Note: IterativeImputer is still experimental; import enable_iterative_imputer first
```

**Per-class threshold tuning loop — find optimal operating point**

```python
import numpy as np
from sklearn.metrics import precision_recall_curve, f1_score

# Get probabilities on a held-out validation set
proba = model.predict_proba(X_val)[:, 1]

# Find the threshold maximizing F1
precisions, recalls, thresholds = precision_recall_curve(y_val, proba)
# precision_recall_curve returns one extra precision/recall; drop the last
f1s = 2 * precisions[:-1] * recalls[:-1] / (precisions[:-1] + recalls[:-1] + 1e-9)
best_thr = thresholds[f1s.argmax()]
print(f"best F1={f1s.max():.4f} at threshold={best_thr:.3f}")

# Apply the tuned threshold in production
preds = (model.predict_proba(X_test)[:, 1] >= best_thr).astype(int)
```

## Functions & Callables

**Custom Transformer that slots into any Pipeline**

```python
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.utils.validation import check_is_fitted
import numpy as np

class LogTransformer(BaseEstimator, TransformerMixin):
    """log1p-transform specified numeric columns, leave others alone."""
    def __init__(self, columns: list[str] | None = None):
        self.columns = columns

    def fit(self, X, y=None):
        self.columns_ = (self.columns if self.columns is not None
                         else X.columns.tolist())
        self.feature_names_in_ = np.asarray(X.columns, dtype=object)
        return self

    def transform(self, X):
        check_is_fitted(self)
        X = X.copy()
        X[self.columns_] = np.log1p(X[self.columns_])
        return X

    def get_feature_names_out(self, input_features=None):
        return self.feature_names_in_

# Now usable in any Pipeline: Pipeline([('log', LogTransformer(['income'])), ...])
```

**Custom scoring function for GridSearchCV / cross_val_score**

```python
from sklearn.metrics import make_scorer, f1_score, precision_score, recall_score

# make_scorer wraps a metric function so it can be passed by string or object
custom_f1 = make_scorer(f1_score, pos_label=1, greater_is_better=True)

# Threshold-tunable scorer: optimize decision threshold at each fold
def threshold_f1(y_true, y_proba, threshold=0.3):
    preds = (y_proba >= threshold).astype(int)
    return f1_score(y_true, preds, pos_label=1)

threshold_scorer = make_scorer(threshold_f1, threshold=0.3,
                                greater_is_better=True,
                                response_method="predict_proba",
                                needs_proba=True)

# Use as: GridSearchCV(est, param_grid, scoring=threshold_scorer, cv=5)
```

**Custom estimator — a simple baseline classifier**

```python
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.utils.validation import check_X_y, check_array, check_is_fitted
import numpy as np

class MajorityVoteClassifier(ClassifierMixin, BaseEstimator):
    """Predicts the majority class; useful as a sanity-check baseline."""
    def fit(self, X, y):
        X, y = check_X_y(X, y)
        self.classes_ = np.unique(y)
        self.majority_ = np.bincount(y).argmax()
        self.is_fitted_ = True
        return self

    def predict(self, X):
        check_is_fitted(self)
        X = check_array(X)
        return np.full(X.shape[0], self.majority_)

    def predict_proba(self, X):
        check_is_fitted(self)
        proba = np.zeros((X.shape[0], len(self.classes_)))
        proba[:, self.majority_] = 1.0
        return proba

# Now drops into GridSearchCV, Pipeline, cross_val_score with no other code
```

**Custom callback via fit_params — per-epoch hook for HistGradientBoosting**

```python
from sklearn.ensemble import HistGradientBoostingClassifier
import numpy as np

class EarlyStoppingCallback:
    """Stop training if validation score hasn't improved in patience rounds."""
    def __init__(self, patience=10):
        self.patience = patience
        self.best_score = -np.inf
        self.wait = 0
        self.should_stop = False

    def __call__(self, env):
        val = env.validation_score_[-1] if env.validation_score_ else np.nan
        if val > self.best_score + 1e-4:
            self.best_score = val
            self.wait = 0
        else:
            self.wait += 1
            if self.wait >= self.patience:
                self.should_stop = True
                env.model_.stop_training_ = True   # HistGBM honors this flag

# 1.4+ exposes the callback hook via the user_hooks parameter:
clf = HistGradientBoostingClassifier(max_iter=500, early_stopping=False)
clf.fit(X_tr, y_tr, user_hooks=[EarlyStoppingCallback(patience=10)])
```

## Error Handling

**Data leakage — fitting scaler before train/test split**

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

# BAD: scaler sees the entire dataset (including test) — CV scores are inflated
scaler = StandardScaler().fit(X)              # LEAKAGE: test stats in train
X_scaled = scaler.transform(X)
X_tr, X_te, y_tr, y_te = train_test_split(X_scaled, y, test_size=0.2)

# GOOD: fit scaler only on the TRAIN fold; transform test with the same scaler
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y)
scaler = StandardScaler().fit(X_tr)            # only train data
X_tr_s = scaler.transform(X_tr)
X_te_s = scaler.transform(X_te)

# BEST: put it in a Pipeline — cross_val_score prevents leakage automatically
from sklearn.pipeline import Pipeline
pipe = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression())])
```

**Unknown category at inference — OneHotEncoder crash**

```python
from sklearn.preprocessing import OneHotEncoder
import numpy as np

# BAD: default OneHotEncoder raises on a new category at test time
enc = OneHotEncoder(handle_unknown="error")
enc.fit([["NYC"], ["LA"], ["SF"]])
# enc.transform([["BOS"]])  # ValueError: Found unknown categories ['BOS']

# GOOD: handle_unknown='ignore' produces all-zero encoding for unseen categories
enc = OneHotEncoder(handle_unknown="ignore", min_frequency=5)
enc.fit(X_train_cat)                         # also: min_frequency buckets rare cats
X_test_ohe = enc.transform(X_test_cat)       # silently zero-rows unseen categories

# For OrdinalEncoder, the equivalent is:
# OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1)
```

**NaN handling — most estimators raise without an imputer**

```python
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

X = np.array([[1, 2], [3, np.nan], [7, 8]])
y = np.array([0, 1, 0])

# BAD: LogisticRegression raises on NaN
# LogisticRegression().fit(X, y)   # ValueError: Input contains NaN

# GOOD: HistGradientBoostingClassifier handles NaN natively (1.4+)
from sklearn.ensemble import HistGradientBoostingClassifier
clf = HistGradientBoostingClassifier()
clf.fit(X, y)                                # works without imputation

# For everything else, put an imputer FIRST in the Pipeline
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),
    ("clf", LogisticRegression()),
])
pipe.fit(X, y)
```

**n_jobs=-1 nested parallelism — CPU oversubscription slowdown**

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV

# BAD: outer CV uses all cores AND each forest uses all cores -> oversubscription
search = GridSearchCV(
    RandomForestClassifier(n_jobs=-1),       # inner parallelism
    param_grid={"max_depth": [5, 10, 20]},
    cv=5, n_jobs=-1,                          # outer parallelism
)

# GOOD: pick ONE level to parallelize
search = GridSearchCV(
    RandomForestClassifier(n_jobs=1),         # inner: sequential
    param_grid={"max_depth": [5, 10, 20]},
    cv=5, n_jobs=-1,                          # outer: parallel across (fold, params)
)

# Or invert: outer sequential, inner parallel
search = GridSearchCV(
    RandomForestClassifier(n_jobs=-1),
    param_grid={"max_depth": [5, 10, 20]},
    cv=5, n_jobs=1,
)
```

## Concurrency Model

**n_jobs=-1 — the standard CPU parallelism knob**

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

# Most estimators accept n_jobs for CPU parallelism
clf = RandomForestClassifier(n_estimators=500, n_jobs=-1, random_state=42)

# cross_val_score and GridSearchCV also accept n_jobs for outer parallelism
scores = cross_val_score(clf, X, y, cv=5, n_jobs=-1, scoring="roc_auc")
# Rule: don't nest n_jobs=-1 inside n_jobs=-1 — pick one level only

# When using cross_val_score(n_jobs=-1), set the inner estimator's n_jobs=1
# so that 5 outer folds × 1 inner = 5 processes (not 5 × N_cores)
```

**joblib.Parallel — run independent estimators in parallel**

```python
from joblib import Parallel, delayed
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

candidates = {
    "rf":  RandomForestClassifier(n_estimators=200, n_jobs=1, random_state=42),
    "gbm": GradientBoostingClassifier(random_state=42),
    "lr":  LogisticRegression(max_iter=1000),
}

# Evaluate each model on the same CV folds in parallel processes
def evaluate(name, est):
    score = cross_val_score(est, X, y, cv=5, scoring="roc_auc", n_jobs=1).mean()
    return name, score

results = Parallel(n_jobs=3)(delayed(evaluate)(n, e) for n, e in candidates.items())
for name, score in sorted(results, key=lambda x: -x[1]):
    print(f"{name:6s} AUC={score:.4f}")
```

**Dask-ML — out-of-core and distributed sklearn for >RAM data**

```python
# pip install dask-ml dask[distributed]
from dask.distributed import Client
from dask_ml.model_selection import GridSearchCV as DaskGridSearchCV
from dask_ml.preprocessing import StandardScaler as DaskStandardScaler
from sklearn.ensemble import RandomForestClassifier

client = Client(n_workers=4, threads_per_worker=2, memory_limit="4GB")

# Dask-ML GridSearchCV has the SAME API as sklearn's — but chunks data
# across workers, so a 50GB dataset fits on a 4×16GB cluster.
search = DaskGridSearchCV(
    RandomForestClassifier(n_estimators=200),
    param_grid={"max_depth": [5, 10, 20]},
    cv=5, scoring="roc_auc",
    scheduler=client,
)
search.fit(X_dask, y_dask)                  # X_dask is a dask.array or dask.dataframe
```

**cuML on GPU — drop-in sklearn replacement for NVIDIA GPUs**

```python
# pip install cuml-cu12  (RAPIDS conda env)
import cudf, cuml
from cuml.ensemble import RandomForestClassifier
from cuml.model_selection import train_test_split
from cuml.metrics import roc_auc_score

# cuML mirrors sklearn's API; .fit and .predict work on GPU DataFrames
X_gpu = cudf.DataFrame.from_pandas(X)
y_gpu = cudf.Series(y)
X_tr, X_te, y_tr, y_te = train_test_split(X_gpu, y_gpu, test_size=0.2, random_state=42)

clf = RandomForestClassifier(n_estimators=500, n_streams=8)  # n_streams = GPU threads
clf.fit(X_tr, y_tr)
preds = clf.predict_proba(X_te)[1]
print(f"GPU AUC: {roc_auc_score(y_te, preds):.4f}")
# Speedup is 10-100x for tree ensembles on >1M rows; same for KMeans/UMAP/PCA
```

## Testing Patterns

**Common estimator checks — sklearn's built-in contract tests**

```python
from sklearn.utils.estimator_checks import check_estimator
from sklearn.linear_model import LogisticRegression

# check_estimator runs a battery of contract tests on any sklearn-compatible estimator:
#   - fit/predict/transform API contract
#   - get_params/set_params roundtrip
#   - clone() independence
#   - sample weights handling
#   - NaN/inf handling
#   - sparse input handling
check_estimator(LogisticRegression())

# For a custom estimator:
check_estimator(MajorityVoteClassifier())   # raises if the contract is broken
```

**pytest fixture — reusable fitted pipeline + held-out data**

```python
import pytest
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

@pytest.fixture(scope="session")
def fitted_pipeline():
    X, y = make_classification(n_samples=1000, n_features=20, random_state=42)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, stratify=y, random_state=42)
    pipe = Pipeline([("scaler", StandardScaler()),
                     ("clf", LogisticRegression(max_iter=1000))])
    pipe.fit(X_tr, y_tr)
    return pipe, X_te, y_te

def test_pipeline_score_above_baseline(fitted_pipeline):
    pipe, X_te, y_te = fitted_pipeline
    acc = pipe.score(X_te, y_te)
    majority = (y_te == y_te[0]).mean()
    assert acc > majority + 0.1, f"model not better than majority: {acc} vs {majority}"
```

**Property-based testing with Hypothesis — invariant checking**

```python
from hypothesis import given, strategies as st, settings
from sklearn.preprocessing import StandardScaler
import numpy as np

@given(st.integers(min_value=10, max_value=200).flatmap(
        lambda n: st.lists(st.floats(min_value=-1e6, max_value=1e6,
                                      allow_nan=False, allow_infinity=False),
                            min_size=n, max_size=n).map(
            lambda xs: np.array(xs).reshape(n, -1))))
@settings(max_examples=20, deadline=None)
def test_scaler_zero_mean_unit_std(X):
    # StandardScaler must produce mean ~= 0 and std ~= 1 for any finite input
    if X.shape[1] == 0: return
    X_t = StandardScaler().fit_transform(X)
    np.testing.assert_allclose(X_t.mean(axis=0), 0, atol=1e-9)
    np.testing.assert_allclose(X_t.std(axis=0), 1, atol=1e-9)

# Hypothesis will find edge cases (constant columns, huge magnitudes, etc.)
```

**Leakage test — verify Pipeline prevents train/test contamination**

```python
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

def test_no_data_leakage_in_pipeline():
    # Create a dataset where train and test have very different scales
    X = np.concatenate([np.ones((50, 1)), np.ones((50, 1)) * 1000])
    y = np.concatenate([np.zeros(50), np.ones(50)])

    pipe = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression())])
    # If the scaler is fit on the WHOLE dataset (leakage), CV scores will be inflated
    scores = cross_val_score(pipe, X, y, cv=5)
    # Pipeline correctly fits scaler only on the train fold -> scores should be near chance
    assert scores.mean() < 0.6, "suspiciously high — possible leakage"

def test_transformer_no_mutation():
    X = np.array([[1.0, 2.0], [3.0, 4.0]])
    X_orig = X.copy()
    StandardScaler().fit_transform(X)
    np.testing.assert_array_equal(X, X_orig)   # input must not be mutated
```

## Performance Tuning

- Trailing-underscore attributes (coef_, classes_, feature_importances_) exist ONLY after fit() — accessing them before raises AttributeError.
- fit_transform() is not always == fit().transform(): TfidfVectorizer and PCA have a faster fused path; always use fit_transform on training data.
- Pipeline caches nothing by default — set memory='/tmp' to cache transformers across GridSearchCV iterations (huge speedup when preprocessing is expensive).
- HistGradientBoostingClassifier is 10-100x faster than GradientBoostingClassifier, handles NaN natively, and is the sklearn-native LightGBM alternative.
- GridSearchCV exhausts the grid (k^d combinations); RandomizedSearchCV samples n_iter — for d>3 hyperparameters, RandomizedSearchCV wins almost always.
- Default CV: StratifiedKFold(5) for classification, KFold(5) for regression. Pass cv=an integer to cross_val_score to use the defaults.
- StandardScaler: mean=0, std=1 — sensitive to outliers. Use RobustScaler (median + IQR) for outlier-heavy data, or QuantileTransformer for severe skew.
- OneHotEncoder(handle_unknown='ignore') is mandatory for production — without it, a new category at inference crashes the pipeline.
- PCA(n_components=0.95) keeps enough components to explain 95% of variance — a one-line dimensionality reducer.
- Most sklearn algorithms are O(n_samples × n_features × n_iterations) — tree ensembles scale ~linearly in samples, k-NN is O(n_samples) at predict time.
- RandomForest n_jobs=-1 uses all cores; HistGradientBoosting does NOT parallelize across samples (only across features). Pick the right one for your bottleneck.
- class_weight='balanced' auto-scales loss by inverse class frequency — the cheapest fix for imbalanced classification, often beats resampling.
- joblib.compress=3 → ~10x smaller files at ~10% slower load; compress=0 is fastest. Pick based on whether you're I/O- or CPU-bound at deploy.
- sklearn 1.4+ supports missing values natively in HistGradientBoosting; most other estimators raise on NaN — use SimpleImputer in the pipeline.
- set_config(transform_output='pandas') (1.2+) makes every transformer return a DataFrame — invaluable for debugging pipelines and getting feature names out.

## Ecosystem & Tooling

| Tool | Purpose | Category |
| --- | --- | --- |
| [pandas](https://pandas.pydata.org/) | DataFrame I/O and feature inspection — the input layer for every sklearn workflow. | build |
| [NumPy](https://numpy.org/) | Dense array backend for sklearn; required dependency. | build |
| [SciPy](https://scipy.org/) | Sparse matrices (csr_matrix), optimization, stats — required dependency. | build |
| [joblib](https://joblib.readthedocs.io/) | Pipelined I/O and parallel execution; the standard sklearn persistence format. | package |
| [matplotlib / seaborn](https://matplotlib.org/) | Visualization — sklearn itself doesn't plot; pair with these for EDA and residual diagnostics. | debug |
| [category_encoders](https://contrib.scikit-learn.org/category_encoders/) | TargetEncoder, LeaveOneOutEncoder, CatBoostEncoder — richer categorical encoders than OneHotEncoder. | build |
| [imbalanced-learn](https://imbalanced-learn.org/) | SMOTE, ADASYN, and resampling pipelines that compose with sklearn Pipeline. | build |
| [scikit-optimize](https://scikit-optimize.readthedocs.io/) | Bayesian hyperparameter optimization with same API as GridSearchCV. | test |
| [Optuna](https://optuna.org/) | Modern TPE/CMA-ES hyperparameter search; integrates with sklearn via sklearn-integrations. | test |
| [XGBoost](https://xgboost.readthedocs.io/) | Industry-standard gradient boosting — sklearn-compatible API via XGBClassifier/XGBRegressor. | build |
| [LightGBM](https://lightgbm.readthedocs.io/) | Microsoft's gradient boosting — faster than XGBoost on large data; sklearn-compatible API. | build |
| [CatBoost](https://catboost.ai/) | Yandex's gradient boosting — handles categorical features natively; sklearn-compatible API. | build |
| [Dask-ML](https://ml.dask.org/) | Out-of-core and distributed sklearn for >RAM datasets — same API, scales to clusters. | build |
| [RAPIDS cuML](https://rapids.ai/cuml/) | NVIDIA GPU drop-in replacement for sklearn — 10-100x speedup on >1M row tabular data. | build |
| [skl2onnx](https://onnx.ai/sklearn-onnx/) | Convert sklearn Pipeline to ONNX format — serve from C#/Java/JS via onnxruntime. | deploy |
| [BentoML](https://bentoml.com/) | Model serving framework with sklearn adapter — packaging, microbatching, and observability. | deploy |
| [MLflow](https://mlflow.org/) | Experiment tracking + model registry — autolog() captures sklearn fits automatically. | debug |
| [Weights & Biases](https://docs.wandb.ai/guides/integrations/scikit) | Experiment tracking with sklearn integration via wandb.sklearn.plot() — model eval plots in one line. | debug |
| [SHAP](https://shap.readthedocs.io/) | Shapley-value feature attribution — TreeExplainer for tree models, LinearExplainer for linear models. | debug |

## Version History

| Version | Year | Highlight |
| --- | --- | --- |
| 0.1 | 2007 | David Cournapeau's Google Summer of Code project — initial scikits.learn. |
| 0.9 | 2011 | First stable release; Pedregosa et al. JMLR paper; Inria took over stewardship. |
| 0.13 | 2013 | Pipeline + FeatureUnion; the modern preprocessing API took shape. |
| 0.14 | 2013 | GridSearchCV with n_jobs; OneHotEncoder added (initially with sparse_output default True). |
| 0.15 | 2014 | TfidfVectorizer stable; cross_val_predict for out-of-fold predictions. |
| 0.16 | 2015 | ColumnTransformer preview; sklearn falls into Tier-1 ML library status. |
| 0.17 | 2015 | TSNE added; BaggingClassifier and VotingClassifier; first GPU-friendly LinearSVC. |
| 0.18 | 2016 | ColumnTransformer stable; model_selection reorg (cross_validation → model_selection). |
| 0.19 | 2017 | MultiOutputClassifier; quantile regression in GradientBoosting; fix for pickle compat. |
| 0.20 | 2018 | openml integration; sklearn.compose module; CategoricalEncoder merged into OneHotEncoder. |
| 0.21 | 2019 | HistGradientBoostingClassifier (experimental); SGDOneClassSVM; RepeatedKFold. |
| 0.22 | 2019 | Permutation importance; KMeans++ default; GradientBoosting histogram preview. |
| 0.23 | 2020 | Generalized PCA; StackingClassifier/Regressor; builder support for OSX arm64. |
| 0.24 | 2020 | Self-training classifier; mean absolute percentage error; SuccessiveHalving search. |
| 1.0 | 2021 | Stable 1.x API contract; dataframes as input preserved feature names; QuantileRegressor. |
| 1.1 | 2022 | QuantileRegressor; HGBT supports categorical splits natively; pandas output preview. |
| 1.2 | 2023 | set_config(transform_output='pandas') stable; OneHotEncoder(sparse_output=...) renamed. |
| 1.3 | 2023 | Metadata routing framework preview; HGBT monotonic constraints; metadata routing for sample_weight. |
| 1.4 | 2024 | Metadata routing GA; HGBT callbacks; TreeEnsemble grows marginal speedups from OpenMP. |
| 1.5 | 2024 | FixedDict for estimator params; PCA sparse support; HGBT early stopping fixes. |
| 1.6 | 2025 | Improved pandas-output coverage; Array API support expands (more estimators work with torch/jax arrays). |
| 1.9 | 2026 | Current stable: experimental Callback API (ProgressBar, ScoringMonitor), narwhals dataframe interop, first release supporting Python 3.15. |

## Interview Hot Questions

1. **Why does sklearn use trailing-underscore attributes (coef_, classes_)?** *(easy)*

   By convention, any attribute ending with underscore is learned from data during fit() — it does NOT exist before fit. This separates configuration (constructor args, no underscore) from learned state (underscore). It also makes static analysis easy: grep for '\.' that doesn't end in '_' to find settings you might have forgotten to fit.

2. **How does Pipeline prevent data leakage?** *(medium)*

   Pipeline.fit(X, y) calls fit_transform on each transformer in order, passing only the train data. .predict() and .transform() then call .transform() (NOT fit_transform) on each step — so test-time statistics (mean, std, vocab) come from the train fold only. cross_val_score and GridSearchCV call fit on the train fold and predict/score on the test fold, so the scaler is fit fresh on each fold's train half.

3. **When would you use GridSearchCV vs RandomizedSearchCV vs Bayesian optimization?** *(medium)*

   GridSearchCV: exhaustive search over k^d combinations — only when d is small (≤3) and you want to be sure you covered the grid. RandomizedSearchCV: samples n_iter points — better for d>3 because random points cover the space more efficiently than a coarse grid. Bayesian (scikit-optimize, Optuna): builds a surrogate of the objective — best when each fit is expensive (minutes/hours) and d>5. Rule: Grid → Random → Bayesian as d and cost grow.

4. **Why does HistGradientBoostingClassifier handle NaN natively while RandomForest doesn't?** *(medium)*

   HistGBM bins features into histograms; NaN gets its own bin and is treated as a valid split direction. RandomForest's underlying CART implementation pre-dates NaN handling and uses a strict numeric-only split. The fix for RF is to impute first (SimpleImputer in the Pipeline) — but HistGBM is usually faster AND handles NaN, so prefer it for tabular work unless you specifically need RF's bagging variance properties.

5. **How does class_weight='balanced' work and when is it insufficient?** *(medium)*

   It re-weights each class's loss contribution by 1/class_frequency, so a class with 1% prevalence gets 99x the weight. This balances the gradient without resampling. It's the cheapest fix and often beats SMOTE. Insufficient when: (1) the minority class has very few absolute examples (need oversampling or different objective); (2) the cost matrix is asymmetric (use sample_weight directly); (3) you need probability calibration (class_weight distorts probabilities — re-calibrate via CalibratedClassifierCV).

6. **Why is joblib preferred over pickle for sklearn models?** *(easy)*

   joblib handles NumPy arrays efficiently — it stores them in a separate .npy file inside the pickle, so loading is memory-mapped instead of materializing the full array. pickle just serializes the whole object graph, which is slow and memory-hungry for arrays. joblib also supports compress=3 out of the box (~10x smaller files). Both use the pickle protocol, so the same security caveats apply — never load untrusted joblib/pickle files.

7. **How would you handle a 50GB dataset that doesn't fit in RAM with sklearn?** *(hard)*

   Three options in order of complexity: (1) partial_fit — SGDClassifier, MultinomialNB, MiniBatchKMeans support incremental training on chunks via pd.read_csv(chunksize=...). (2) Dask-ML — drop-in replacement that chunks data across a cluster; same sklearn API. (3) cuML on GPU — if the dataset fits in GPU memory (e.g. 80GB A100), use cuML for 10-100x speedup. Avoid: random_forest with bootstrap over the whole dataset (doesn't support partial_fit); use Dask-ML's train_test_split + a sampler.

8. **How do you calibrate predicted probabilities?** *(medium)*

   Most tree models (RandomForest, GradientBoosting) produce probabilities that are biased toward 0.5 — the rankings are right but the magnitudes are wrong. CalibratedClassifierCV wraps the estimator and applies Platt sigmoid (method='sigmoid') or isotonic regression (method='isotropic') to map raw scores to calibrated probabilities. Use cv=5 for cross-validated calibration. Verify with calibration_curve() — plot predicted vs empirical probability per bin.

9. **Why does OneHotEncoder drop one column per categorical feature in linear models?** *(medium)*

   To avoid the dummy-variable trap: with all K categories one-hot encoded, the columns sum to 1 — perfect collinearity with the intercept. Linear solvers (normal equations, closed-form ridge) become singular. Drop 'first' or 'if_binary' removes one column per feature. Tree models don't need this — they handle collinearity natively. Use OneHotEncoder(drop='first') ONLY for linear models; for tree/HGBT use drop=None (more info to split on).

10. **How would you detect and debug a model that's overfitting in production?** *(hard)*

   (1) Compare train vs test vs out-of-fold (cross_val_score) metrics — a wide gap = overfitting. (2) Learning curves: plot train/val score vs dataset size; if train stays at 100% and val plateaus below, you need more data OR a simpler model. (3) Permutation importance: zero or negative importance on features you expected to matter = the model memorized noise. (4) SHAP dependence plots: if the model relies on an ID-like feature with high cardinality, it's likely memorizing. Fixes: stronger regularization (alpha, max_depth), drop leaky features, more data, simpler model class.

## When to Choose This

- **vs XGBoost / LightGBM / CatBoost:** use this — Quick baselines, smaller datasets (<100k rows), when you want sklearn's pure-Python tooling and no extra dependencies.; use that — Production gradient boosting at scale — these are 5-50x faster, handle categorical features natively (CatBoost especially), and have GPU support built-in.
- **vs PyTorch / TensorFlow:** use this — Tabular data, classical ML (RF, SVM, k-NN), preprocessing pipelines, model selection with grid search — anything <1M parameters and not deep learning.; use that — Deep learning (any architecture with layers), gradient-based optimization on GPU/TPU, anything where features need to be learned (CNNs, transformers, RNNs).
- **vs Spark MLlib:** use this — Single-machine data (<100GB), interactive iteration in a notebook, when you value sklearn's mature API and rich algorithm set.; use that — Truly distributed workloads on >1TB data, when you already have a Spark cluster, batch scoring at PB scale.
- **vs RAPIDS cuML:** use this — CPU-only environments, small-to-medium data (<10GB), when you don't have an NVIDIA GPU, when power efficiency matters more than wall-clock time.; use that — GPU-available, data >10GB, when 10-100x speedup justifies the CUDA dependency; drop-in API means zero code changes.
- **vs statsmodels:** use this — Predictive modeling, ML-style workflows (CV, hyperparameter tuning), when inference quality matters more than p-values and confidence intervals.; use that — Statistical inference — hypothesis tests, ANOVA, GLM with summary tables, when you need coefficients with standard errors and p-values, time-series with ARIMA/SARIMAX.

