export interface IMessage<T = string, P = any> {
    type: T;
    from: string;
    payload: P;
    room?: string;
}
export declare function createMessage<M extends IMessage = IMessage>(from: string, type: M["type"], payload: M["payload"], room?: string): M;
export declare function isMessage<M extends IMessage = IMessage>(value: any): value is M;
