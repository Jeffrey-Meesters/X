<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!-- Front view, lying on the back. Opposite arm and leg extend together.
     Convention is documented in goblet-squat.vue: 200x200 viewBox, ground at
     y=185, side profile unless noted, CSS keyframes on grouped <g> elements,
     3.5s loop (0.25s hold, 2s eccentric, 0.25s hold, 1s concentric). -->

<template>
  <svg viewBox="0 0 200 200" role="img" class="fig" :class="{ 'is-paused': paused }">
    <title>Dead bug</title>
    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <g class="ghost" aria-hidden="true">
      <circle cx="100" cy="46" r="12" />
      <line x1="100" y1="58" x2="100" y2="118" />
      <line x1="100" y1="70" x2="70" y2="52" />
      <line x1="100" y1="118" x2="126" y2="158" />
    </g>
    <path class="arrow" d="M150 80 L150 104 M145 98 L150 105 L155 98" aria-hidden="true" />
    <rect class="prop" x="42" y="30" width="116" height="150" rx="10" />
    <g class="figure">
      <circle class="head" cx="100" cy="46" r="12" />
      <line x1="100" y1="58" x2="100" y2="118" />
      <g class="limbA">
        <line x1="100" y1="70" x2="70" y2="52" />
        <line x1="100" y1="118" x2="126" y2="158" />
      </g>
      <g class="limbB">
        <line x1="100" y1="70" x2="130" y2="52" />
        <line x1="100" y1="118" x2="74" y2="158" />
      </g>
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

.limbA {
  transform-box: view-box;
  transform-origin: 100px 94px;
  animation: limbA 3.5s ease-in-out infinite;
}

@keyframes limbA {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(-16deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.limbB {
  transform-box: view-box;
  transform-origin: 100px 94px;
  animation: limbB 3.5s ease-in-out infinite;
}

@keyframes limbB {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(16deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.is-paused :is(.limbA, .limbB) {
  animation-play-state: paused;
}

.ghost,
.arrow {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .limbA, .limbB {
    animation: none;
  }
  .limbA {
    transform: rotate(-16deg);
  }
  .limbB {
    transform: rotate(16deg);
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
