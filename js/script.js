(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  /* 2. Parallax background + fading hero text + sticky header */
  var bg = document.getElementById('heroBg');
  var content = document.querySelector('.hero-content');
  var header = document.getElementById('top');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || 0;
    var h = window.innerHeight;
    header.classList.toggle('solid', y > 40);
    if (!reduce && y < h * 1.2) {
      bg.style.translate = '0 ' + (y * 0.25) + 'px';
      content.style.transform = 'translateY(' + (y * 0.35) + 'px)';
      content.style.opacity = Math.max(0, 1 - y / (h * 0.65));
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* 3. Reveal elements as they enter the viewport */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.18 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  /* 4. Click a frame to put your own image in it (temporary preview) */
  var pick = document.getElementById('pick');
  var current = null;
  document.querySelectorAll('.slot').forEach(function (b) {
    b.addEventListener('click', function () { current = b; pick.click(); });
  });
  pick.addEventListener('change', function () {
    var f = pick.files && pick.files[0];
    if (!f || !current) return;
    var r = new FileReader();
    r.onload = function () {
      var img = current.querySelector('img');
      img.src = r.result; img.hidden = false; current.classList.add('has');
      pick.value = '';
    };
    r.readAsDataURL(f);
  });
})();