export const JOB_OFFER_QUERY_CHUNK_SIZE = 100;

export type PersistedJobMatch = {
  eligibility_status: string;
  status: string;
};

export function matchesResultFilter(
  match: PersistedJobMatch,
  selectedResult: string,
) {
  if (selectedResult === "useful") {
    return match.eligibility_status !== "REJECTED";
  }

  if (selectedResult === "SAVED" || selectedResult === "DISMISSED") {
    return match.status === selectedResult && match.eligibility_status !== "REJECTED";
  }

  return match.eligibility_status === selectedResult;
}

export function chunkValues<T>(values: T[], size = JOB_OFFER_QUERY_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
