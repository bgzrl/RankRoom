import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
} from '@rankroom/shared';
import { io, type Socket } from 'socket.io-client';
import { getOrCreatePlayerToken } from './session';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: TypedClientSocket | null = null;

export function getSocket(): TypedClientSocket {
  if (!socketInstance) {
    socketInstance = io({
      auth: {
        playerToken: getOrCreatePlayerToken(),
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socketInstance;
}

export function emitWithAck<T>(
  registerEmit: (ack: (response: SocketAck<T>) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    registerEmit((response) => {
      if (response.ok) {
        resolve(response.data);
      } else {
        reject(new Error(response.error.message));
      }
    });
  });
}
