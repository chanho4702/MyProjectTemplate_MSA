import http from 'k6/http';
import { check } from 'k6';
import { createSoakPlan, createSummaryArtifacts } from './lib/scenario-config.js';

const plan = createSoakPlan(__ENV);

export const options = plan.options;

export default function () {
  const requestId = `k6-soak-${__VU}-${__ITER}`;
  const isWrite = plan.inputs.writeRatio > 0 && Math.random() < plan.inputs.writeRatio;

  const response = isWrite
    ? http.post(
        `${plan.context.baseUrl}/api/v1/items`,
        JSON.stringify({ name: requestId }),
        { headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId } },
      )
    : http.get(`${plan.context.baseUrl}/api/v1/items`, {
        headers: { 'X-Request-Id': requestId },
      });

  check(response, {
    'status is success': (result) => result.status === (isWrite ? 201 : 200),
  });
}

export function handleSummary(data) {
  return createSummaryArtifacts(data, plan);
}
