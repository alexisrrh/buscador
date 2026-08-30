interface SearchProfileLookup {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          is(column: string, value: null): {
            maybeSingle(): PromiseLike<{
              data: { id: string; status: string } | null;
              error: unknown;
            }>;
          };
        };
      };
    };
  };
}

export async function assertActiveSearchProfile(
  client: unknown,
  userId: string,
  searchProfileId: string,
) {
  const { data, error } = await (client as SearchProfileLookup)
    .from("search_profiles")
    .select("id,status")
    .eq("id", searchProfileId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) throw new Error("La búsqueda seleccionada no existe.");
  if (data.status !== "ACTIVE") throw new Error("La búsqueda seleccionada no está activa.");
}
