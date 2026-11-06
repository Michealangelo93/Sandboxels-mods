// ============================================
//  Dinosaur Mod for Sandboxels
//  Adds: Dino Egg, Baby Dino, T-Rex, Triceratops,
//        Raptor, Pterodactyl, Dino Fossil
//  All elements show up in the "life" category.
// ============================================

(function () {

  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  const PLANTS = ["grass", "plant", "vine", "bamboo", "algae", "lichen", "moss", "leaf"];
  const DINOS = ["trex", "triceratops", "raptor", "pterodactyl", "baby_dino"];
  const ADULTS = ["triceratops", "triceratops", "raptor", "trex", "pterodactyl"];

  // ---------- helpers ----------

  // Walk left/right, fall with gravity, and climb 1-pixel steps
  function walk(pixel, speed) {
    if (pixel.dir === undefined) pixel.dir = Math.random() < 0.5 ? 1 : -1;

    // gravity
    if (tryMove(pixel, pixel.x, pixel.y + 1)) return;

    // randomly turn around
    if (Math.random() < 0.02) pixel.dir *= -1;

    if (Math.random() < speed) {
      const y0 = pixel.y;
      const nx = pixel.x + pixel.dir;
      if (!tryMove(pixel, nx, y0)) {
        // try to step up over a small obstacle
        if (isEmpty(pixel.x, y0 - 1) && isEmpty(nx, y0 - 1)) {
          tryMove(pixel, pixel.x, y0 - 1);
          tryMove(pixel, nx, pixel.y);
        } else {
          pixel.dir *= -1;
        }
      }
    }
  }

  // Look around for food or prey. Returns true if it ate something.
  function eat(pixel, foods, prey) {
    if (Math.random() > 0.25) return false;
    const order = NEIGHBORS.slice().sort(() => Math.random() - 0.5);
    for (const [dx, dy] of order) {
      const x = pixel.x + dx, y = pixel.y + dy;
      if (outOfBounds(x, y)) continue;
      const t = pixelMap[x][y];
      if (!t) continue;
      if (foods.includes(t.element)) {
        deletePixel(x, y);
        return true;
      }
      if (prey && prey.includes(t.element)) {
        changePixel(t, "meat"); // kill it, leave meat behind to eat
        return false;
      }
    }
    return false;
  }

  function layEgg(pixel) {
    for (const [dx, dy] of NEIGHBORS) {
      const x = pixel.x + dx, y = pixel.y + dy;
      if (isEmpty(x, y)) {
        createPixel("dino_egg", x, y);
        return;
      }
    }
  }

  function feed(pixel, needed) {
    pixel.fed = (pixel.fed || 0) + 1;
    if (pixel.fed >= needed) {
      pixel.fed = 0;
      layEgg(pixel);
    }
  }

  const baseDino = {
    category: "life",
    state: "solid",
    behavior: behaviors.WALL,
    temp: 30,
    tempHigh: 250,
    stateHigh: "cooked_meat",
    breakInto: "meat",
    reactions: {
      "cyanide": { elem1: "meat" },
      "radiation": { elem1: "meat", chance: 0.3 }
    }
  };

  // ---------- Dino Egg ----------
  elements.dino_egg = {
    color: ["#d9d2b6", "#cfc8a8", "#e2dcc4"],
    behavior: behaviors.STURDYPOWDER,
    category: "life",
    state: "solid",
    density: 1100,
    temp: 25,
    tempHigh: 100,
    stateHigh: "cooked_meat",
    breakInto: "yolk",
    tick: function (pixel) {
      pixel.age = (pixel.age || 0) + 1;
      // hatches if it's been warm and cozy for a while
      if (pixel.age > 400 && pixel.temp > 10 && pixel.temp < 70) {
        if (Math.random() < 0.02) changePixel(pixel, "baby_dino");
      }
    }
  };

  // ---------- Baby Dino ----------
  elements.baby_dino = Object.assign({}, baseDino, {
    color: ["#9ccc65", "#8bc34a", "#aed581"],
    density: 1000,
    tick: function (pixel) {
      pixel.age = (pixel.age || 0) + 1;
      walk(pixel, 0.5);
      eat(pixel, PLANTS.concat(["meat"]));
      if (pixel.age > 700 && Math.random() < 0.02) {
        const kind = ADULTS[Math.floor(Math.random() * ADULTS.length)];
        changePixel(pixel, kind);
      }
    }
  });

  // ---------- Triceratops (herbivore) ----------
  elements.triceratops = Object.assign({}, baseDino, {
    color: ["#6d8b3a", "#5f7d32", "#7a9a45"],
    density: 1400,
    tick: function (pixel) {
      walk(pixel, 0.35);
      if (eat(pixel, PLANTS)) feed(pixel, 3);
    }
  });

  // ---------- T-Rex (apex predator) ----------
  elements.trex = Object.assign({}, baseDino, {
    color: ["#8d4a2b", "#7b3f24", "#9c5532"],
    density: 1600,
    tick: function (pixel) {
      walk(pixel, 0.3);
      const prey = ["triceratops", "raptor", "baby_dino", "frog", "fish", "bird", "rat"];
      if (eat(pixel, ["meat", "cooked_meat"], prey)) feed(pixel, 4);
    }
  });

  // ---------- Raptor (fast hunter) ----------
  elements.raptor = Object.assign({}, baseDino, {
    color: ["#c9772e", "#b8691f", "#d68a3f"],
    density: 1200,
    tick: function (pixel) {
      walk(pixel, 0.8);
      const prey = ["baby_dino", "frog", "fish", "bird", "rat"];
      if (eat(pixel, ["meat", "cooked_meat"], prey)) feed(pixel, 3);
    }
  });

  // ---------- Pterodactyl (flyer) ----------
  elements.pterodactyl = Object.assign({}, baseDino, {
    color: ["#7e57c2", "#6a46b0", "#9575cd"],
    density: 900,
    tick: function (pixel) {
      if (pixel.dir === undefined) pixel.dir = Math.random() < 0.5 ? 1 : -1;
      if (Math.random() < 0.03) pixel.dir *= -1;

      let dy;
      const r = Math.random();
      if (pixel.y < 12) dy = r < 0.7 ? 1 : 0;      // stay off the ceiling
      else dy = r < 0.35 ? -1 : r < 0.7 ? 0 : 1;

      if (!tryMove(pixel, pixel.x + pixel.dir, pixel.y + dy)) {
        pixel.dir *= -1;
      }

      if (eat(pixel, ["meat", "cooked_meat"], ["fish", "frog", "bird"])) feed(pixel, 4);
    }
  });

  // ---------- Dino Fossil ----------
  elements.dino_fossil = {
    color: ["#b8a98a", "#a89878", "#c4b596"],
    behavior: behaviors.WALL,
    category: "solids",
    state: "solid",
    density: 2500,
    hardness: 0.6,
    tempHigh: 1200,
    stateHigh: "magma",
    breakInto: ["rock", "sand"]
  };

})();
