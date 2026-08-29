<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!-- A hold. The movement is only the slow drift to resist.
     Convention is documented in goblet-squat.vue: 200x200 viewBox, ground at
     y=185, side profile unless noted, CSS keyframes on grouped <g> elements,
     3.5s loop (0.25s hold, 2s eccentric, 0.25s hold, 1s concentric). -->

<template>
  <svg viewBox="0 0 200 200" role="img" class="fig" :class="{ 'is-paused': paused }">
    <title>Plank</title>
    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <g class="ghost" aria-hidden="true">
      <circle cx="70" cy="140" r="11" />
      <line x1="81" y1="146" x2="128" y2="146" />
      <line x1="128" y1="146" x2="140" y2="168" />
      <line x1="140" y1="168" x2="132" y2="183" />
      <line x1="95" y1="146" x2="95" y2="118" />
    </g>
    <path class="arrow" d="M164 138 L164 158 M159 152 L164 159 L169 152" aria-hidden="true" />
    <g class="body">
      <circle class="head" cx="58" cy="128" r="11" />
      <line x1="69" y1="134" x2="146" y2="160" />
      <line x1="146" y1="160" x2="150" y2="183" />
      <line x1="72" y1="136" x2="72" y2="183" />
      <line x1="72" y1="183" x2="94" y2="183" />
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
  transform-origin: 150px 183px;
  animation: body 3.5s ease-in-out infinite;
}

@keyframes body {
  0%,
  7% {
    transform: translateY(0px);
  }
  64%,
  71% {
    transform: translateY(4px);
  }
  100% {
    transform: translateY(0px);
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
    transform: translateY(4px);
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
