export const Debounced = (fn: Function, time: number = 300, immediate: boolean = false) => {
    let timer: ReturnType<typeof setTimeout> | null;
    return function (this: any, ...args: any[]) {
        if (timer) clearTimeout(timer);
        if (immediate) { // 立即执行
            if (!timer) fn.apply(this, args);
            timer = setTimeout(() => {
                timer = null;
            }, time)
        } else { // 最后执行
            timer = setTimeout(() => fn.apply(this, args), time);
        }
    };
};

// export const isEqual = (object1: any, object2: any) => {
//     if (Object.prototype.toString.call(object1) !== Object.prototype.toString.call(object2)) return false;
//     let o1keys = Object.keys(object1);
//     let o2keys = Object.keys(object2);
//     if (o2keys.length !== o1keys.length) return false;
//     for (let i = 0; i <= o1keys.length - 1; i++) {
//       let key = o1keys[i];
//       if (!o2keys.includes(key)) return false;
//       if (object2[key] !== object1[key]) return false;
//     }
//     return true;
// }

