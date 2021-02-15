export enum MessageType {
  Peers,
  Data,
}

export interface IMessage<T = any> {
  type: MessageType;
  from: string;
  payload: T;
}

export function isMessage(value: any): value is IMessage {
  return (
    value != null && typeof value === "object" && typeof value.type === "number"
  );
}
