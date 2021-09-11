export interface IMessage<T = string, P = any> {
    type: T;
    from: string;
    payload: P;
}
export declare function createMessage<M extends IMessage = IMessage>(from: string, type: M["type"], payload: M["payload"]): M;
export declare function isMessage<M extends IMessage = IMessage>(value: any): value is M;
export declare function isMessageOfType<M extends IMessage = IMessage>(value: any, type: M["type"]): value is M;
