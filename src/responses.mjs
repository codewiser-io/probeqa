export function readResponseStatus(response) {
  if (!response) return 'no response';
  const status = response.status;
  try {
    if (typeof status === 'function') return status.call(response);
    if (typeof status === 'number') return status;
  } catch {
    return 'no response';
  }
  return 'no response';
}

export function responseLooksOk(response) {
  if (!response) return false;
  const ok = response.ok;
  try {
    if (typeof ok === 'function') return Boolean(ok.call(response));
    if (typeof ok === 'boolean') return ok;
  } catch {
    return false;
  }
  const status = readResponseStatus(response);
  return typeof status === 'number' && status >= 200 && status < 300;
}
