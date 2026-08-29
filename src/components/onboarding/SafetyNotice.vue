<script setup lang="ts">
/**
 * The safety acknowledgement copy (spec section 10).
 *
 * Shared between onboarding and Settings → About so the two can never drift.
 * Plain language rather than a legalese wall: a screen nobody reads protects
 * nobody.
 *
 * NOT CLEARED COPY. The spec is explicit that this is a starting point needing
 * legal review before any public launch, and that the automatic progression
 * suggestions are the feature most worth checking against EU medical-device
 * classification. Tracked in issue #3.
 */
</script>

<template>
  <div class="space-y-4 text-base leading-relaxed">
    <p>
      This app gives general fitness information. It is not medical advice, and
      it cannot tell whether an exercise is right for you.
    </p>
    <p>
      <strong class="font-semibold">Check with a doctor first</strong> if you
      have a medical condition, are carrying an injury, or are new to resistance
      training.
    </p>
    <p>
      <strong class="font-semibold">Stop if something hurts.</strong> Muscles
      working hard is expected. Sharp pain, or pain in a joint, is not — that is
      a reason to stop, not to push through.
    </p>
    <p>
      The app cannot see you. Nothing it says accounts for how you are actually
      moving, so your own judgement about your form always comes first.
    </p>
    <p>
      It also <strong class="font-semibold">suggests weight increases</strong>,
      and those come from your logged numbers alone. They know nothing about how
      a session felt, how you slept, or what else you did that week. Override
      them whenever they do not match how it went.
    </p>
  </div>
</template>
