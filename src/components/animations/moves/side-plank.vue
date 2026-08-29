<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!-- Stacked shoulders and hips, held. The cue is not letting the hips drop.
     Convention is documented in goblet-squat.vue: 200x200 viewBox, ground at
     y=185, side profile unless noted, CSS keyframes on grouped <g> elements,
     3.5s loop (0.25s hold, 2s eccentric, 0.25s hold, 1s concentric). -->

<template>
  <svg viewBox="0 0 200 200" role="img" class="fig" :class="{ 'is-paused': paused }">
    <title>Side plank</title>
    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <g class="ghost" aria-hidden="true">
      <circle cx="62" cy="112" r="11" />
      <line x1="73" y1="118" x2="150" y2="176" />
      <line x1="73" y1="118" x2="66" y2="150" />
    </g>
    <path class="arrow" d="M110 120 L110 142 M105 136 L110 143 L115 136" aria-hidden="true" />
    <g class="body">
      <circle class="head" cx="62" cy="112" r="11" />
      <line x1="73" y1="118" x2="150" y2="176" />
      <line x1="73" y1="118" x2="66" y2="150" />
      <line x1="66" y1="150" x2="88" y2="150" />
      <line x1="150" y1="176" x2="166" y2="183" />
    </g>
  </svg>
</template>

<style scoped>
.fig {
  width: 100%;
  height: 100%;
  color: inherit;
  --accent: var(--color-work);
}

.fig :is(line, circle, path, polyline) {
  fill: none;
  stroke: currentColor;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ground {
  stroke-width: 2;
  opacity: 0.3;
}

.head {
  stroke-width: 3.5;
}

.joint {
  r: 4;
  stroke-width: 2;
  opacity: 0.45;
}

.prop {
  stroke-width: 3;
  opacity: 0.4;
}

.load {
  fill: var(--accent);
  stroke: none;
}

.body {
  transform-box: view-box;
  transform-origin: 150px 176px;
  animation: body 3.5s ease-in-out infinite;
}

@keyframes body {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(5deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.is-paused :is(.body) {
  animation-play-state: paused;
}

.ghost,
.arrow {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .body {
    animation: none;
  }
  .body {
    transform: rotate(5deg);
  }
  .ghost,
  .arrow {
    display: block;
    opacity: 0.32;
  }
  .ghost {
    transform: translateX(-46px);
    transform-box: view-box;
  }
}
</style>
