import { bulletinLine, visitChannel, type BulletinNote } from '../management/social';

/**
 * A host who has the game open hears about a visit as it happens. The note is already on their bulletin; this only tells them now.
 * `connect` is Devvit's connectRealtime, passed in so it is tested without a connection. Anything that is not a visit note is ignored.
 */
export type Connect = (options: { channel: string; onMessage: (message: unknown) => void }) => unknown;
export function listenForVisits(connect: Connect, hostId: string | undefined, onVisit: (line: string, note: BulletinNote) => void): boolean {
  if (!hostId) return false;
  connect({ channel: visitChannel(hostId), onMessage: message => {
    const note = (message as { kind?: unknown; note?: Partial<BulletinNote> } | null)?.note;
    if ((message as { kind?: unknown } | null)?.kind !== 'visit' || !note || typeof note.visitor !== 'string' || typeof note.line !== 'string' || typeof note.thought !== 'string') return;
    onVisit(bulletinLine(note as BulletinNote), note as BulletinNote);
  } });
  return true;
}
