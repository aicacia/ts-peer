export interface IMessage<T = string, P = any> {
  type: T;
  from: string;
  payload: P;
  room?: string;
}

export function createMessage<M extends IMessage = IMessage>(
  from: string,
  type: M["type"],
  payload: M["payload"],
  room?: string
): M {
  return {
    type,
    payload,
    from,
    room,
  } as M;
}

export function isMessage<M extends IMessage = IMessage>(
  value: any
): value is M {
  return value !== null && typeof value === "object" && "type" in value;
}
