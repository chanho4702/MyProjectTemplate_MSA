const LOCAL_BASE_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;
const RESULT_FILE_PATTERN = /^load-tests\/results\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.json$/;
const DURATION_PATTERN = /^\d+(?:\.\d+)?(?:ms|s|m|h)$/;
const SUMMARY_TREND_STATS = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function requiredString(environment, name) {
  const value = stringValue(environment[name]);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalString(environment, name) {
  const value = stringValue(environment[name]);
  return value || null;
}

function positiveNumber(environment, name, defaultValue) {
  const rawValue = environment[name];
  if ((rawValue === undefined || rawValue === '') && defaultValue !== undefined) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function fraction(environment, name, defaultValue) {
  const value = positiveNumber(environment, name, defaultValue);
  if (value >= 1) {
    throw new Error(`${name} must be greater than 0 and less than 1`);
  }
  return value;
}

function duration(environment, name, defaultValue) {
  const value = stringValue(environment[name]) || defaultValue;
  if (!DURATION_PATTERN.test(value) || Number.parseFloat(value) <= 0) {
    throw new Error(`${name} must be a single k6 duration such as 30s, 5m, or 4h`);
  }
  return value;
}

function resultFile(environment) {
  const value = requiredString(environment, 'RESULT_FILE').replace(/\\/g, '/');
  if (!RESULT_FILE_PATTERN.test(value) || value.includes('../')) {
    throw new Error('RESULT_FILE must be a JSON file below load-tests/results');
  }
  return value;
}

function baseUrl(environment) {
  const value = (environment.BASE_URL || 'http://localhost:8081').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(value)) {
    throw new Error('BASE_URL must use http or https');
  }
  if (!LOCAL_BASE_URL_PATTERN.test(value) && environment.ALLOW_NON_LOCAL !== 'true') {
    throw new Error('Set ALLOW_NON_LOCAL=true explicitly before testing a non-local target');
  }
  return value;
}

function thresholds(environment) {
  const maxErrorRate = fraction(environment, 'MAX_ERROR_RATE', 0.001);
  const p95Milliseconds = positiveNumber(environment, 'P95_MS', 300);
  const p99Milliseconds = positiveNumber(environment, 'P99_MS', 800);

  return {
    values: { maxErrorRate, p95Milliseconds, p99Milliseconds },
    k6: {
      http_req_failed: [`rate<${maxErrorRate}`],
      http_req_duration: [
        `p(95)<${p95Milliseconds}`,
        `p(99)<${p99Milliseconds}`,
      ],
      dropped_iterations: ['count==0'],
    },
  };
}

function vuAllocation(peakRate) {
  return {
    preAllocatedVUs: Math.max(10, Math.ceil(peakRate / 4)),
    maxVUs: Math.max(50, Math.ceil(peakRate * 2)),
  };
}

function runContext(environment, scenario) {
  return {
    scenario,
    baseUrl: baseUrl(environment),
    resultFile: resultFile(environment),
    metadata: {
      gitSha: requiredString(environment, 'GIT_SHA'),
      imageDigest: optionalString(environment, 'IMAGE_DIGEST'),
      testEnvironment: requiredString(environment, 'TEST_ENVIRONMENT'),
      instanceProfile: requiredString(environment, 'INSTANCE_PROFILE'),
      datasetDescription: requiredString(environment, 'DATASET_DESCRIPTION'),
      dependencyProfile: optionalString(environment, 'DEPENDENCY_PROFILE'),
    },
  };
}

function parseKneeRates(environment) {
  const rawValue = requiredString(environment, 'KNEE_RATES');
  const rates = rawValue.split(',').map((part) => Number(part.trim()));
  if (rates.length < 2 || rates.some((rate) => !Number.isInteger(rate) || rate <= 0)) {
    throw new Error('KNEE_RATES must contain at least two positive integer rates');
  }
  if (rates.some((rate, index) => index > 0 && rate <= rates[index - 1])) {
    throw new Error('KNEE_RATES must be strictly increasing');
  }
  return rates;
}

export function createKneePlan(environment) {
  const context = runContext(environment, 'knee');
  const rates = parseKneeRates(environment);
  const stageDuration = duration(environment, 'STAGE_DURATION', '2m');
  const recoveryDuration = duration(environment, 'RECOVERY_DURATION', '2m');
  const thresholdConfig = thresholds(environment);
  const peakRate = rates[rates.length - 1];

  return {
    context,
    inputs: {
      rates,
      stageDuration,
      recoveryDuration,
      thresholds: thresholdConfig.values,
    },
    options: {
      summaryTrendStats: [...SUMMARY_TREND_STATS],
      scenarios: {
        knee_read: {
          executor: 'ramping-arrival-rate',
          startRate: rates[0],
          timeUnit: '1s',
          stages: [
            ...rates.map((target) => ({ target, duration: stageDuration })),
            { target: rates[0], duration: recoveryDuration },
          ],
          ...vuAllocation(peakRate),
          gracefulStop: '30s',
        },
      },
      thresholds: thresholdConfig.k6,
    },
  };
}

export function createSpikePlan(environment) {
  const context = runContext(environment, 'spike');
  const baselineTps = positiveNumber(environment, 'BASELINE_TPS');
  const spikeMultiplier = positiveNumber(environment, 'SPIKE_MULTIPLIER', 3);
  const spikeTps = Math.ceil(baselineTps * spikeMultiplier);
  const warmupDuration = duration(environment, 'WARMUP_DURATION', '2m');
  const rampDuration = duration(environment, 'SPIKE_RAMP_DURATION', '30s');
  const spikeDuration = duration(environment, 'SPIKE_DURATION', '30s');
  const recoveryDuration = duration(environment, 'RECOVERY_DURATION', '2m');
  const thresholdConfig = thresholds(environment);

  return {
    context,
    inputs: {
      baselineTps,
      spikeMultiplier,
      spikeTps,
      warmupDuration,
      rampDuration,
      spikeDuration,
      recoveryDuration,
      thresholds: thresholdConfig.values,
    },
    options: {
      summaryTrendStats: [...SUMMARY_TREND_STATS],
      scenarios: {
        spike_read: {
          executor: 'ramping-arrival-rate',
          startRate: baselineTps,
          timeUnit: '1s',
          stages: [
            { target: baselineTps, duration: warmupDuration },
            { target: spikeTps, duration: rampDuration },
            { target: spikeTps, duration: spikeDuration },
            { target: baselineTps, duration: rampDuration },
            { target: baselineTps, duration: recoveryDuration },
          ],
          ...vuAllocation(spikeTps),
          gracefulStop: '30s',
        },
      },
      thresholds: thresholdConfig.k6,
    },
  };
}

export function createSoakPlan(environment) {
  const context = runContext(environment, 'soak');
  const targetTps = positiveNumber(environment, 'TARGET_TPS');
  const testDuration = duration(environment, 'DURATION', '4h');
  const writeRatio = fraction(environment, 'WRITE_RATIO', 0);
  const thresholdConfig = thresholds(environment);

  return {
    context,
    inputs: {
      targetTps,
      duration: testDuration,
      writeRatio,
      thresholds: thresholdConfig.values,
    },
    options: {
      summaryTrendStats: [...SUMMARY_TREND_STATS],
      scenarios: {
        soak_read: {
          executor: 'constant-arrival-rate',
          rate: targetTps,
          timeUnit: '1s',
          duration: testDuration,
          ...vuAllocation(targetTps),
          gracefulStop: '30s',
        },
      },
      thresholds: thresholdConfig.k6,
    },
  };
}

export function createSummaryArtifacts(data, plan) {
  return {
    [plan.context.resultFile]: JSON.stringify(
      {
        metadata: {
          ...plan.context.metadata,
          scenario: plan.context.scenario,
          baseUrl: plan.context.baseUrl,
          completedAt: new Date().toISOString(),
        },
        inputs: plan.inputs,
        k6Summary: data,
      },
      null,
      2,
    ),
  };
}
