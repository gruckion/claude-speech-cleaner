This is a synthetic code-reading example. The file is `billing_helpers/total-cost.ts`.

```ts
function totalCost(price: number, quantity: number): number {
  if (quantity < 0) throw new Error("Quantity must not be negative");
  return price * quantity;
}
```

That is the end of the example.
