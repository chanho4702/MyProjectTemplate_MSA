import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createKneePlan,
  createSoakPlan,
  createSpikePlan,
  createSummaryArtifacts,
} from '../lib/scenario-config.js';

function environment(overrides = {}) {
  return {
    BASE_URL: 'http://localhost:8081',
    GIT_SHA: '0123456789abcdef0123456789abcdef01234567',
    TEST_ENVIRONMENT: 'local',
    INSTANCE_PROFILE: '1 app, 2 vCPU, 2 GiB heap',
    DATASET_DESCRIPTION: '10,000 items, read-only request mix',
    RESULT_FILE: 'load-tests/results/test-summary.json',
    ...overrides,
  };
}

test('knee plan creates increasing stages and a recovery stage', () => {
  const plan = createKneePlan(environment({ KNEE_RATES: '25, 50, 100' }));

  assert.deepEqual(plan.inputs.rates, [25, 50, 100]);
  assert.deepEqual(plan.options.scenarios.knee_read.stages, [
    { target: 25, duration: '2m' },
    { target: 50, duration: '2m' },
    { target: 100, duration: '2m' },
    { target: 25, duration: '2m' },
  ]);
  assert.equal(plan.options.scenarios.knee_read.maxVUs, 200);
});

test('knee rates must be strictly increasing positive integers', () => {
  assert.throws(
    () => createKneePlan(environment({ KNEE_RATES: '25,25,50' })),
    /strictly increasing/,
  );
  assert.throws(
    () => createKneePlan(environment({ KNEE_RATES: '10.5,20' })),
    /positive integer rates/,
  );
});

test('spike plan raises the baseline by the configured multiplier and recovers', () => {
  const plan = createSpikePlan(environment({ BASELINE_TPS: '40' }));
  const stages = plan.options.scenarios.spike_read.stages;

  assert.equal(plan.inputs.spikeTps, 120);
  assert.deepEqual(stages.map((stage) => stage.target), [40, 120, 120, 40, 40]);
  assert.deepEqual(stages.map((stage) => stage.duration), ['2m', '30s', '30s', '30s', '2m']);
});

test('soak plan requires an explicit target and defaults to four hours', () => {
  const plan = createSoakPlan(environment({ TARGET_TPS: '75' }));

  assert.equal(plan.options.scenarios.soak_read.rate, 75);
  assert.equal(plan.options.scenarios.soak_read.duration, '4h');
  assert.equal(plan.inputs.writeRatio, 0);
  assert.throws(() => createSoakPlan(environment()), /TARGET_TPS/);
  assert.throws(
    () => createSoakPlan(environment({ TARGET_TPS: '75', DURATION: '0m' })),
    /single k6 duration/,
  );
});

test('soak plan accepts an explicit write ratio for a mixed GET/POST request mix', () => {
  const plan = createSoakPlan(environment({ TARGET_TPS: '75', WRITE_RATIO: '0.1' }));

  assert.equal(plan.inputs.writeRatio, 0.1);
  assert.throws(
    () => createSoakPlan(environment({ TARGET_TPS: '75', WRITE_RATIO: '1' })),
    /WRITE_RATIO must be greater than 0 and less than 1/,
  );
});

test('thresholds can be overridden without changing scenario construction', () => {
  const plan = createSoakPlan(environment({
    TARGET_TPS: '50',
    MAX_ERROR_RATE: '0.005',
    P95_MS: '450',
    P99_MS: '900',
  }));

  assert.deepEqual(plan.options.thresholds, {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<450', 'p(99)<900'],
    dropped_iterations: ['count==0'],
  });
  assert.deepEqual(plan.options.summaryTrendStats, [
    'avg',
    'min',
    'med',
    'max',
    'p(90)',
    'p(95)',
    'p(99)',
  ]);
});

test('non-local targets require explicit opt-in', () => {
  assert.throws(
    () => createSoakPlan(environment({ BASE_URL: 'https://dev.example.com', TARGET_TPS: '10' })),
    /ALLOW_NON_LOCAL=true/,
  );

  const plan = createSoakPlan(environment({
    BASE_URL: 'https://dev.example.com/',
    ALLOW_NON_LOCAL: 'true',
    TARGET_TPS: '10',
  }));
  assert.equal(plan.context.baseUrl, 'https://dev.example.com');
});

test('run metadata and result path are mandatory', () => {
  assert.throws(
    () => createSpikePlan(environment({ GIT_SHA: '', BASELINE_TPS: '10' })),
    /GIT_SHA is required/,
  );
  assert.throws(
    () => createSpikePlan(environment({
      BASELINE_TPS: '10',
      RESULT_FILE: '../outside.json',
    })),
    /below load-tests\/results/,
  );
});

test('summary artifact contains metadata, inputs, and raw k6 summary', () => {
  const plan = createSpikePlan(environment({
    BASELINE_TPS: '20',
    IMAGE_DIGEST: 'sha256:abc123',
    DEPENDENCY_PROFILE: 'PostgreSQL writer only',
  }));
  const artifacts = createSummaryArtifacts({ metrics: { checks: { values: { rate: 1 } } } }, plan);
  const summary = JSON.parse(artifacts['load-tests/results/test-summary.json']);

  assert.equal(summary.metadata.scenario, 'spike');
  assert.equal(summary.metadata.gitSha, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(summary.metadata.imageDigest, 'sha256:abc123');
  assert.equal(summary.inputs.spikeTps, 60);
  assert.equal(summary.k6Summary.metrics.checks.values.rate, 1);
});
