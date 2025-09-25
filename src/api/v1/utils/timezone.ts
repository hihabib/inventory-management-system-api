/**
 * Utility function to convert date to local ISO string format
 * This handles local timezone conversion automatically
 */
export function toLocalISOString(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return (
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate()) + "T" +
    pad(date.getHours()) + ":" +
    pad(date.getMinutes()) + ":" +
    pad(date.getSeconds()) + "." +
    String(date.getMilliseconds()).padStart(3, '0')
  );
}
export  function getCurrentDate(){
    return new Date(toLocalISOString());
}
