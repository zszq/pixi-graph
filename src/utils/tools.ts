// 是否是整数
export function isInteger(value: any): boolean {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}

// 验证是否为URL
export function isUrl(str: string) {
  var reg = new RegExp(
    '^(?!mailto:)(?:(?:http|https|ftp)://|//)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$',
    'i'
  );
  return reg.test(str);
}

export function throttle(func: Function, delay: number): Function {
  let lastCalledTime = 0;
  let timeoutId: number | undefined = undefined;

  return function (...args: any[]) {
    const now = Date.now();

    if (!lastCalledTime || now - lastCalledTime >= delay) {
      // @ts-ignore
      func.apply(this, args);
      lastCalledTime = now;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        // @ts-ignore
        func.apply(this, args);
        lastCalledTime = now;
      }, delay - (now - lastCalledTime));
    }
  };
}

// 获取两个数组不同值
// export function arrayComplement(arr1: any[], arr2: any[]) {
//   let difference = arr1.filter(x => arr2.indexOf(x) == -1).concat(arr2.filter(x => arr1.indexOf(x) == -1));
//   return difference;
// }

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
