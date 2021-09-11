export interface IMessage<T = string, P = any> {
  type: T;
  from: string;
  payload: P;
}

export function createMessage<M extends IMessage = IMessage>(
  from: string,
  type: M["type"],
  payload: M["payload"]
): M {
  return {
    type,
    payload,
    from,
  } as M;
}

export function isMessage<M extends IMessage = IMessage>(
  value: any
): value is M {
  return value !== null && typeof value === "object" && "type" in value;
}

export function isMessageOfType<M extends IMessage = IMessage>(
  value: any,
  type: M["type"]
): value is M {
  return isMessage(value) && value.type === type;
}
