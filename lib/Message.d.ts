export declare enum MessageType {
    Peers = 0,
    Data = 1
}
export interface IMessage<T = any> {
    type: MessageType;
    from: string;
    payload: T;
}
export declare function isMessage(value: any): value is IMessage;
