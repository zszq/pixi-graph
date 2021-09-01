
// 验证是否为URL
export function isUrl(str:string) {
  var reg = new RegExp('^(?!mailto:)(?:(?:http|https|ftp)://|//)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$', 'i');
  return reg.test(str);
}

// 获取两个数组不同值
export function arrayComplement(arr1: any[], arr2: any[]) {
  let difference = arr1.filter(x => arr2.indexOf(x) == -1).concat(arr2.filter(x => arr1.indexOf(x) == -1));
  return difference;
}

// 去抖
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

