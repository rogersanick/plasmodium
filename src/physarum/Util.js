function rndFloat(min = 0, max = 1) {
  return min + (max - min) * Math.random();
}
function rndInt(min = 0, max = 1) {
  return Math.round(min + (max - min) * Math.random());
}

function isSafari() {
  return (
    !!navigator.userAgent.match(/Safari/i) &&
    !navigator.userAgent.match(/Chrome/i)
  );
}

export { rndFloat, rndInt, isSafari };
