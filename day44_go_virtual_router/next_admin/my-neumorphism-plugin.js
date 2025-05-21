const plugin = require('tailwindcss/plugin');

module.exports = plugin(function({ addComponents, theme }) {
  const neumorphismComponents = {
    '.neumorphism-parent': {
      backgroundColor: theme('colors.slate.800'),
      borderRadius: theme('borderRadius.xl'),
      padding: theme('spacing.4'),
      transitionProperty: 'all',
      transitionTimingFunction: theme('transitionTimingFunction.ease-in-out'), // 'in-out' から 'ease-in-out' に変更 (Tailwind標準のキー)
      transitionDuration: theme('transitionDuration.200'),
    },
    '.neumorphism-inset': {
      backgroundColor: theme('colors.slate.800'),
      borderRadius: theme('borderRadius.lg'),
      boxShadow: 'inset 5px 5px 10px #1e293b, inset -5px -5px 10px #334155',
      transitionProperty: 'all',
      transitionTimingFunction: theme('transitionTimingFunction.ease-in-out'),
      transitionDuration: theme('transitionDuration.200'),
    },
    '.neumorphism-outset': {
      backgroundColor: theme('colors.slate.800'),
      borderRadius: theme('borderRadius.lg'),
      boxShadow: '5px 5px 10px #1e293b, -5px -5px 10px #334155',
      transitionProperty: 'all',
      transitionTimingFunction: theme('transitionTimingFunction.ease-in-out'),
      transitionDuration: theme('transitionDuration.200'),
    },
    '.neumorphism-outset-active': {
      boxShadow: 'inset 5px 5px 10px #1e293b, inset -5px -5px 10px #334155',
    },
    '.btn-neumorphism': {
      paddingTop: theme('spacing.3'),
      paddingBottom: theme('spacing.3'),
      paddingLeft: theme('spacing.5'),
      paddingRight: theme('spacing.5'),
      backgroundColor: theme('colors.slate.800'), // from .neumorphism-outset
      borderRadius: theme('borderRadius.lg'),    // from .neumorphism-outset
      boxShadow: '5px 5px 10px #1e293b, -5px -5px 10px #334155', // from .neumorphism-outset
      transitionProperty: 'all',                 // from .neumorphism-outset
      transitionTimingFunction: theme('transitionTimingFunction.ease-in-out'), // from .neumorphism-outset
      transitionDuration: theme('transitionDuration.200'), // from .neumorphism-outset
      color: theme('colors.sky.400'),
      fontWeight: theme('fontWeight.semibold'),
      '&:hover': {
        // from .neumorphism-outset-active
        boxShadow: 'inset 5px 5px 10px #1e293b, inset -5px -5px 10px #334155',
      },
      '&:active': {
        // from .neumorphism-inset (for shadow)
        boxShadow: 'inset 5px 5px 10px #1e293b, inset -5px -5px 10px #334155',
      },
    },
    '.input-neumorphism': {
      // from .neumorphism-inset
      backgroundColor: theme('colors.slate.800'), // Base background for the inset effect
      borderRadius: theme('borderRadius.lg'),
      boxShadow: 'inset 5px 5px 10px #1e293b, inset -5px -5px 10px #334155',
      padding: theme('spacing.3'), // Padding for the overall element
      // Specific to input field appearance itself
      // To make the actual input area transparent over the neumorphic base:
      // This requires careful handling. The plugin adds a class.
      // The input element itself might need to have `background-color: transparent;`
      // For simplicity, we make the input background the same as the inset base.
      // If a truly transparent input field over a textured base is needed,
      // it might involve more complex HTML structure or ::before/::after pseudo-elements.

      color: theme('colors.slate.50'), // Text color
      '&::placeholder': {
        color: theme('colors.slate.500'),
      },
      outline: 'none',
      width: '100%',
      // Note: `bg-transparent` was in the original @apply.
      // If the input field *itself* should be transparent over the .neumorphism-inset base,
      // then the input element in HTML should get `bg-transparent`.
      // The .input-neumorphism class provides the inset- aparência.
      // Here, we'll set the backgroundColor for the input to match its inset container.
      // This means the placeholder is shown on a slate-800 background.
    },
    '.card-neumorphism': {
      // from .neumorphism-outset
      backgroundColor: theme('colors.slate.800'),
      borderRadius: theme('borderRadius.lg'),
      boxShadow: '5px 5px 10px #1e293b, -5px -5px 10px #334155',
      padding: theme('spacing.4'),
      transitionProperty: 'all',
      transitionTimingFunction: theme('transitionTimingFunction.ease-in-out'),
      transitionDuration: theme('transitionDuration.200'),
    },
  };
  addComponents(neumorphismComponents);
});
