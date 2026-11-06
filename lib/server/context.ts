import "server-only";

export type VerifiedSession = {
  user: { id: string; disabled: boolean };
  session: { id: string; expiresAt: Date };
};

export type ActorContext = Readonly<{
  userId: string;
  sessionId: string;
  expiresAt: number;
}>;

const issuedActors = new WeakSet<ActorContext>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AuthenticationRequiredError extends Error {
  constructor() { super("AUTHENTICATION_REQUIRED"); }
}

/** The reader must validate the session/account in a trusted server-side store.
 * Task 07 supplies the Better Auth adapter; never pass browser claims here. */
export async function requireActor(
  readVerifiedSession: () => Promise<VerifiedSession | null>,
): Promise<ActorContext> {
  const value = await readVerifiedSession();
  if (!value || !UUID.test(value.user.id) || value.user.disabled !== false ||
      !value.session.id || !(value.session.expiresAt instanceof Date) ||
      !(value.session.expiresAt.getTime() > Date.now())) {
    throw new AuthenticationRequiredError();
  }
  const actor = Object.freeze({
    userId: value.user.id.toLowerCase(),
    sessionId: value.session.id,
    expiresAt: value.session.expiresAt.getTime(),
  });
  issuedActors.add(actor);
  return actor;
}

export function assertActor(actor: ActorContext): void {
  if (!issuedActors.has(actor) || actor.expiresAt <= Date.now()) {
    throw new AuthenticationRequiredError();
  }
}
