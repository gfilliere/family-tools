interface ErrorBody {
  error?: string;
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = await parseJson(response);

  if (!response.ok) {
    const message = isErrorBody(body) ? body.error : undefined;
    throw new Error(message ?? `Request failed (${response.status}).`);
  }

  return body as T;
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === "object" && value !== null && "error" in value;
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (response.ok) throw new Error("The server returned an invalid response.");
    return undefined;
  }
}
