<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!-- A wide arc with the elbow angle held, not a press.
     Convention is documented in goblet-squat.vue: 200x200 viewBox, ground at
     y=185, side profile unless noted, CSS keyframes on grouped <g> elements,
     3.5s loop (0.25s hold, 2s eccentric, 0.25s hold, 1s concentric). -->

<template>
  <svg viewBox="0 0 200 200" role="img" class="fig" :class="{ 'is-paused': paused }">
    <title>Dumbbell chest fly</title>
    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <g class="ghost" aria-hidden="true">
      <circle cx="70" cy="140" r="11" />
      <line x1="81" y1="146" x2="128" y2="146" />
      <line x1="128" y1="146" x2="140" y2="168" />
      <line x1="140" y1="168" x2="132" y2="183" />
      <line x1="95" y1="146" x2="95" y2="118" />
    </g>
    <path class="arrow" d="M150 132 L150 156 M145 150 L150 157 L155 150" aria-hidden="true" />
    <g class="body">
      <circle class="head" cx="58" cy="166" r="11" />
      <line x1="69" y1="172" x2="126" y2="172" />
      <line x1="126" y1="172" x2="142" y2="192" />
      <line x1="142" y1="192" x2="136" y2="183" />
      <circle class="joint" cx="92" cy="172" r="4" />
      <g class="upperarm">
        <line x1="95" y1="172" x2="95" y2="132" />
        <rect class="load" x="87" y="122" width="16" height="10" rx="5" />
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

.upperarm {
  transform-box: view-box;
  transform-origin: 95px 172px;
  animation: upperarm 3.5s ease-in-out infinite;
}

@keyframes upperarm {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(74deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.is-paused :is(.upperarm) {
  animation-play-state: paused;
}

.ghost,
.arrow {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .upperarm {
    animation: none;
  }
  .upperarm {
    transform: rotate(74deg);
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
