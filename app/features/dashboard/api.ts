const API_ENDPOINT = '/api/private-cash';

export async function callPrivacyCashApi<T>(payload: Record<string, unknown>, endpoint = API_ENDPOINT) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error('Failed to reach the relay.');
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('Relay returned an invalid response.');
  }

  if (!response.ok) {
    const message =
      typeof (json as { error?: unknown })?.error === 'string' ? (json as { error: string }).error : 'Relay request failed.';
    throw new Error(message);
  }

  return json as T;
}

export const PrivacyCashApi = {
  call: callPrivacyCashApi,
  endpoint: API_ENDPOINT,
};

