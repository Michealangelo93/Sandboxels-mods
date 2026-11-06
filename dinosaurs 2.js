// ============================================
//  Dinosaur Mod for Sandboxels
//  Adds: Dino Egg, Baby Dino, T-Rex, Triceratops,
//        Raptor, Pterodactyl, Dino Fossil
//  All elements show up in the "life" category.
//
//  The T-Rex is a 6-pixel creature (4 wide, 3 tall):
//      XX..
//      .XXX
//      ..X.
//  so it stands taller than a human (2 pixels).
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
  // `origins` is an optional list of [x, y] spots to eat from (big creatures
  // use their mouth and feet). Defaults to the pixel itself.
  function eat(pixel, foods, prey, origins) {
    if (Math.random() > 0.25) return false;
    const spots = origins || [[pixel.x, pixel.y]];
    for (const [ox, oy] of spots) {
      const order = NEIGHBORS.slice().sort(() => Math.random() - 0.5);
      for (const [dx, dy] of order) {
        const x = ox + dx, y = oy + dy;
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

  // ---------- big T-Rex helpers ----------
  //
  // The T-Rex is one "brain" pixel (element: trex, the foot) plus five
  // "trex_body" pixels around it. The brain moves the whole shape together.
  // Offsets are [dx, dy] from the foot while FACING LEFT (dir = -1);
  // they get mirrored when it faces right (dir = 1).
  //
  //   XX..     head
  //   .XXX     body + tail
  //   ..X.     foot (the brain pixel)
  //
  // Want it even bigger? Add more offsets to this list.
  const TREX_SHAPE = [
    [-2, -2], [-1, -2],          // head (first two = the mouth)
    [-1, -1], [0, -1], [1, -1]   // body and tail
  ];

  function trexCells(ax, ay, dir) {
    return TREX_SHAPE.map(([dx, dy]) => [ax - dir * dx, ay + dy]);
  }

  // Fill in any missing body pixels around the brain pixel
  function trexBuild(pixel) {
    for (const [x, y] of trexCells(pixel.x, pixel.y, pixel.dir)) {
      if (!outOfBounds(x, y) && isEmpty(x, y)) {
        createPixel("trex_body", x, y);
        const p = pixelMap[x][y];
        if (p) {
          p.offX = x - pixel.x;
          p.offY = y - pixel.y;
          p.temp = pixel.temp;
        }
      }
    }
  }

  function trexIntact(pixel) {
    for (const [x, y] of trexCells(pixel.x, pixel.y, pixel.dir)) {
      if (outOfBounds(x, y)) return false;
      const p = pixelMap[x][y];
      if (!p || p.element !== "trex_body") return false;
    }
    return true;
  }

  function trexDie(pixel) {
    for (const [x, y] of trexCells(pixel.x, pixel.y, pixel.dir)) {
      if (outOfBounds(x, y)) continue;
      const p = pixelMap[x][y];
      if (p && p.element === "trex_body") changePixel(p, "meat");
    }
    changePixel(pixel, "meat");
  }

  // Move the whole T-Rex so its foot is at (nx, ny) facing ndir.
  // Only works if every pixel of the new shape has room.
  function trexRelocate(pixel, nx, ny, ndir) {
    const oldCells = trexCells(pixel.x, pixel.y, pixel.dir);
    const newCells = trexCells(nx, ny, ndir);

    const mine = new Set(oldCells.map(([x, y]) => x + "," + y));
    mine.add(pixel.x + "," + pixel.y);

    for (const [x, y] of newCells.concat([[nx, ny]])) {
      if (outOfBounds(x, y)) return false;
      if (!isEmpty(x, y) && !mine.has(x + "," + y)) return false;
    }

    // lift the body off the map
    for (const [x, y] of oldCells) {
      const p = pixelMap[x] && pixelMap[x][y];
      if (p && p.element === "trex_body") deletePixel(x, y);
    }

    // move the foot
    if (nx !== pixel.x || ny !== pixel.y) {
      if (!tryMove(pixel, nx, ny)) {
        trexBuild(pixel); // couldn't move, put the body back
        return false;
      }
    }

    pixel.dir = ndir;
    trexBuild(pixel);
    return true;
  }

  function trexWalk(pixel, speed) {
    // gravity
    if (trexRelocate(pixel, pixel.x, pixel.y + 1, pixel.dir)) return;

    // randomly turn around
    if (Math.random() < 0.02) {
      trexRelocate(pixel, pixel.x, pixel.y, -pixel.dir);
      return;
    }

    if (Math.random() < speed) {
      const d = pixel.dir;
      if (trexRelocate(pixel, pixel.x + d, pixel.y, d)) return;      // walk
      if (trexRelocate(pixel, pixel.x + d, pixel.y - 1, d)) return;  // step up 1
      if (trexRelocate(pixel, pixel.x + d, pixel.y - 2, d)) return;  // step up 2
      trexRelocate(pixel, pixel.x, pixel.y, -d);                      // blocked, turn around
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

  // ---------- T-Rex (apex predator, 6 pixels) ----------
  // The brain pixel (the foot). Draw this one; it builds the rest of the body.
  elements.trex = Object.assign({}, baseDino, {
    color: ["#745447", "#6c4d41", "#7b5a4c"],
    density: 1600,
    tick: function (pixel) {
      if (pixel.dir === undefined) pixel.dir = Math.random() < 0.5 ? 1 : -1;

      // First tick(s): grow the body. If there's no room, give up and
      // turn back into a baby dino who'll try again when grown.
      if (!pixel.built) {
        const cells = trexCells(pixel.x, pixel.y, pixel.dir);
        if (cells.every(([x, y]) => !outOfBounds(x, y) && isEmpty(x, y))) {
          trexBuild(pixel);
          pixel.built = true;
        } else {
          pixel.tries = (pixel.tries || 0) + 1;
          if (pixel.tries % 5 === 0) pixel.dir *= -1; // try facing the other way
          if (pixel.tries > 40) {
            pixel.tries = 0;
            pixel.age = 0;
            changePixel(pixel, "baby_dino");
          }
        }
        return;
      }

      // If any part of the body was destroyed, the whole thing dies
      if (!trexIntact(pixel)) {
        trexDie(pixel);
        return;
      }

      trexWalk(pixel, 0.3);

      const prey = ["triceratops", "raptor", "baby_dino", "frog", "fish", "bird", "rat"];
      const mouth = trexCells(pixel.x, pixel.y, pixel.dir).slice(0, 2);
      mouth.push([pixel.x, pixel.y]); // the foot can grab meat off the ground too
      if (eat(pixel, ["meat", "cooked_meat"], prey, mouth)) feed(pixel, 4);
    }
  });

  // The other five pixels of the T-Rex. Hidden from the menu.
  elements.trex_body = Object.assign({}, baseDino, {
    color: ["#745447", "#6c4d41", "#7b5a4c"],
    density: 1600,
    hidden: true,
    tick: function (pixel) {
      // stray body pixel with no brain? turn to meat
      if (pixel.offX === undefined) {
        changePixel(pixel, "meat");
        return;
      }
      const ax = pixel.x - pixel.offX, ay = pixel.y - pixel.offY;
      const a = !outOfBounds(ax, ay) && pixelMap[ax][ay];
      if (!a || a.element !== "trex") changePixel(pixel, "meat");
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
