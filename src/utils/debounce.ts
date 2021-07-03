// export class Debounced {
//     /**
//      * @param fn 要执行的函数
//      * @param awit  时间
//      * @param immediate 是否在触发事件后 在时间段n开始，立即执行，否则是时间段n结束，才执行
//      */
//     static use(fn: Function, awit: number = 1000, immediate: boolean = false) {
//         let timer: NodeJS.Timeout | null = null;
//         return (...args: any) => {
//             if (timer) clearInterval(timer)
//             if (immediate) {
//                 if (!timer) fn.apply(this, args);
//                 timer = setTimeout(function () {//n 秒内 多次触发事件,重新计算.timeer
//                     timer = null;//n 秒内没有触发事件 timeer 设置为null，保证了n 秒后能重新触发事件 flag = true = !timmer
//                 }, awit)
//             } else {
//                 timer = setTimeout(() => { fn.apply(this, args) }, awit)
//             }
//         }
//     }
// }

export const Debounced = (fn: Function, ms = 300) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return function (this: any, ...args: any[]) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), ms);
    };
};