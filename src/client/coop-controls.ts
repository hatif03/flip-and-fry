import { CoopClient, type Connect, type Disconnect } from './coop';
import type { Http, Session } from './session';
import type { RemoteSession, RestaurantEngine } from '../management/engine';

/**
 * What the screens use for hosted service: one switch for the host (invite a neighbor tonight), a list of kitchens to help in, and
 * join and leave. It connects the lockstep client to the session: when the doors open with the switch on, the night is offered;
 * when the night ends, it is withdrawn; while helping, the restaurant on screen is the host's and none of it is saved as ours.
 */
export function coopControls(engine: RestaurantEngine, http: Http, session: Session, connect: Connect, disconnect: Disconnect, notify: (text: string) => void): NonNullable<RemoteSession['coop']> {
  const client = new CoopClient(engine, http, connect, disconnect, session);
  let invite = false, helpingAt: string | null = null;
  client.onNotice = notify;
  client.onEnd = () => { helpingAt = null; notify('The night is over. Back to your own restaurant.'); engine.notify(); };
  session.onOpened = async () => { if (invite && !session.guest) { const error = await client.startHosting(); if (error) notify(error); else notify('A neighbor can help at your pass tonight.'); } };
  session.onClosing = async () => { if (client.hosting) await client.stopHosting(); };
  return {
    get invite() { return invite; },
    setInvite(on: boolean) { invite = on; engine.notify(); },
    helpingAt: () => helpingAt,
    async list() {
      const r = await http('GET', '/api/coop/list'); return r.status === 200 ? (r.body as { sessions: Awaited<ReturnType<NonNullable<RemoteSession['coop']>['list']>> }).sessions : [];
    },
    async join(hostId: string) {
      const sessions = await this.list(), error = await client.join(hostId);
      if (!error) { helpingAt = sessions.find(s => s.id === hostId)?.host ?? 'a neighbor'; engine.notify(); }
      return error;
    },
    async leave() { await client.leave(); helpingAt = null; engine.notify(); },
  };
}
