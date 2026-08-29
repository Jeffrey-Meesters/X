<script setup lang="ts">
defineProps<{ paused?: boolean }>()
</script>

<!-- A continuous circle rather than a there-and-back rep.
     Convention is documented in goblet-squat.vue: 200x200 viewBox, ground at
     y=185, side profile unless noted, CSS keyframes on grouped <g> elements,
     3.5s loop (0.25s hold, 2s eccentric, 0.25s hold, 1s concentric). -->

<template>
  <svg viewBox="0 0 200 200" role="img" class="fig" :class="{ 'is-paused': paused }">
    <title>Arm circles</title>
    <line class="ground" x1="20" y1="185" x2="180" y2="185" />

    <g class="ghost" aria-hidden="true">
      <circle cx="100" cy="58" r="12" />
      <line x1="100" y1="70" x2="100" y2="112" />
      <line x1="100" y1="112" x2="100" y2="150" />
      <line x1="100" y1="150" x2="100" y2="183" />
      <line x1="94" y1="183" x2="114" y2="184" />
    </g>
    <path class="arrow" d="M138 92 A22 22 0 1 1 132 74" aria-hidden="true" />
    <g class="shin">
      <line x1="100" y1="183" x2="100" y2="150" />
      <line x1="94" y1="183" x2="115" y2="184" />
      <circle class="joint" cx="100" cy="150" r="4" />

      <g class="thigh">
        <line x1="100" y1="150" x2="100" y2="112" />
        <circle class="joint" cx="100" cy="112" r="4" />

        <g class="torso">
          <line x1="100" y1="112" x2="100" y2="71" />
          <circle class="head" cx="100" cy="58" r="12" />
          <g class="arm">
            <line x1="100" y1="80" x2="128" y2="80" />
          </g>
        </g>
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

.arm {
  transform-box: view-box;
  transform-origin: 100px 80px;
  animation: arm 3.5s linear infinite;
}

@keyframes arm {
  0%,
  7% {
    transform: rotate(0deg);
  }
  64%,
  71% {
    transform: rotate(360deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.is-paused :is(.arm) {
  animation-play-state: paused;
}

.ghost,
.arrow {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .arm {
    animation: none;
  }
  .arm {
    transform: rotate(360deg);
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
