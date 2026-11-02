import { Vector3, Quaternion, Euler, RAPIER, type ScriptContext, type Vec3 } from "@pinefall/sdk";
import { Combat, FlowField, WEAPONS, seeded } from "./Rules.ts";
export default function director(ctx: ScriptContext) {
  const host = ctx.engine,
    physics = host.physics,
    random = seeded(4729),
    field = new FlowField();
  let game = new Combat(),
    intermission = 5,
    remaining = 0,
    spawnTimer = 0,
    pathTimer = 0,
    hudTimer = 0,
    elapsed = 0,
    footstep = 0,
    vertical = 0,
    kick = 0,
    flash = 0,
    hitTimer = 0,
    hurtTimer = 0,
    noticeTimer = 4,
    best = 0;
  const previous = new Set<string>(),
    oldInput = { ...host.inputOptions },
    aim = new Quaternion(),
    axis = new Vector3(0, 0, 1),
    eye = new Vector3(),
    forward = new Vector3(),
    offset = new Vector3();
  const enemies = Array.from({ length: 12 }, (_, i) => ({
    id: "enemy-" + i,
    active: false,
    hp: 0,
    speed: 0,
    attack: 0,
    cooldown: 0,
    corpse: 0,
    variant: 0,
  }));
  const bullets = Array.from({ length: 32 }, (_, i) => ({
    id: "tracer-" + i,
    active: false,
    position: new Vector3(),
    direction: new Vector3(),
    life: 0,
    damage: 0,
  }));
  const impacts = Array.from({ length: 16 }, (_, i) => ({ id: "impact-" + i, life: 0 }));
  const caches = [true, true, true, true];
  let impactIndex = 0;
  const setVisible = (id: string, value: boolean) => {
    const e = ctx.find(id);
    if (e) e.enabled = value;
    const o = ctx.objectFor(id);
    if (o) o.visible = value;
  };
  const position = (id: string) =>
    physics.bodies.get(id)?.translation() ?? ctx.objectFor(id)!.position;
  const play = (name: string, p?: Vec3) => {
    if (p) host.audio.play(name, "nightfall-spatial", p);
    else ctx.audio.play(name);
  };
  const animate = (id: string, state: string) => host.animators.get(id)?.graph.play(state, 0.12);
  const edge = (key: string) => ctx.input.has(key) && !previous.has(key);
  const cast = (origin: Vector3, dir: Vector3, distance: number, excluded: string) =>
    physics.world.castRay(
      new RAPIER.Ray(origin, dir),
      distance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      physics.bodies.get(excluded),
    );
  const clearShot = (from: Vector3, to: Vector3, excluded: string) => {
    const d = to.clone().sub(from),
      length = d.length();
    if (length < 0.01) return true;
    d.divideScalar(length);
    const hit = cast(from, d, length, excluded);
    return !hit || physics.ids.get(hit.collider.handle) === ctx.entity.id;
  };
  const showNotice = (text: string, seconds = 3) => {
    ctx.ui.setText("notice", text);
    noticeTimer = seconds;
  };
  function refresh() {
    ctx.ui.setText(
      "health",
      `VITALS ${Math.ceil(game.health)}   |   STAMINA ${Math.ceil(game.stamina)}`,
    );
    const w = WEAPONS[game.weapon];
    ctx.ui.setText(
      "ammo",
      `${w.name}    ${game.reloading ? "RELOADING" : game.magazines[game.weapon] + " / " + game.reserves[game.weapon]}`,
    );
    ctx.ui.setText(
      "wave",
      game.dead
        ? `BEST WAVE ${best}`
        : intermission > 0
          ? `NEXT WAVE IN ${Math.ceil(intermission)}s`
          : `WAVE ${String(game.wave).padStart(2, "0")}   /   ${remaining + enemies.filter((e) => e.active).length} REMAIN`,
    );
    ctx.ui.setText("score", `${game.kills} KILLS  /  ${game.score} POINTS`);
    ctx.ui.setText("crosshair", hitTimer > 0 ? "×" : "+");
    ctx.ui.setText("damage", hurtTimer > 0 ? "YOU ARE BLEEDING" : "");
    ctx.state.stats = {
      health: game.health,
      wave: game.wave,
      kills: game.kills,
      ammo: game.magazines[game.weapon],
      active: enemies.filter((e) => e.active).length,
      remaining,
      dead: game.dead,
    };
  }
  function reset() {
    game = new Combat();
    intermission = 5;
    remaining = 0;
    spawnTimer = 0;
    pathTimer = 0;
    vertical = 0;
    hurtTimer = 0;
    hitTimer = 0;
    flash = 0;
    kick = 0;
    previous.clear();
    host.input.clear();
    host.inputPressed.clear();
    host.look.yaw = 0;
    host.look.pitch = 0;
    ctx.teleport([0, 1.05, 20]);
    for (const e of enemies) {
      e.active = false;
      e.corpse = 0;
      setVisible(e.id, false);
      physics.bodies.get(e.id)!.setEnabled(false);
    }
    for (const b of bullets) {
      b.active = false;
      setVisible(b.id, false);
    }
    for (const p of impacts) {
      p.life = 0;
      setVisible(p.id, false);
    }
    for (let i = 0; i < 4; i++) {
      caches[i] = true;
      setVisible("cache-" + i, true);
    }
    ctx.ui.setVisible("retry", false);
    ctx.ui.setVisible("crosshair", true);
    setVisible("flashlight", true);
    showNotice("THE GATE IS OPEN. THE WOODS ARE NOT EMPTY.", 4);
    refresh();
  }
  function hurt(damage: number) {
    if (game.dead) return;
    game.damage(damage);
    hurtTimer = 0.65;
    play("impact");
    if (game.dead) {
      best = Math.max(best, game.wave);
      try {
        if (typeof localStorage !== "undefined")
          localStorage.setItem("nightfall-best", String(best));
      } catch {
        /* Storage is optional in private/sandboxed contexts. */
      }
      ctx.ui.setVisible("crosshair", false);
      ctx.ui.setVisible("retry", true);
      showNotice(`THE KEEP CLAIMED YOU / WAVE ${game.wave} / ENTER TO RETRY`, 999999);
      ctx.emit("nightfall-death", { wave: game.wave, kills: game.kills });
    }
    refresh();
  }
  function spawnEnemy() {
    const e = enemies.find((e) => !e.active && e.corpse <= 0);
    if (!e) return false;
    const p = position(ctx.entity.id);
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = random() * Math.PI * 2,
        d = 18 + random() * 14,
        x = p.x + Math.cos(angle) * d,
        z = p.z + Math.sin(angle) * d,
        index = field.index(x, z);
      if (
        Math.abs(x) > 74 ||
        Math.abs(z) > 74 ||
        index < 0 ||
        field.blocked[index] ||
        field.distance[index] < 4
      )
        continue;
      e.active = true;
      e.variant = game.wave >= 3 && random() < 0.3 ? 1 : 0;
      e.hp = 70 + game.wave * 9 + (e.variant ? 35 : 0);
      e.speed = Math.min(4, 1.3 + game.wave * 0.12) + (e.variant ? 0.5 : 0);
      e.attack = 0;
      e.cooldown = 0.5;
      setVisible(e.id, true);
      const body = physics.bodies.get(e.id)!;
      body.setEnabled(true);
      ctx.teleport([x, 1.06, z], e.id);
      body.setNextKinematicTranslation({ x, y: 1.06, z });
      animate(e.id, "walk");
      play("growl", [x, 1, z]);
      return true;
    }
    return false;
  }
  function shoot() {
    if (!game.fire()) {
      if (game.magazines[game.weapon] === 0 && game.reload()) play("reload");
      return;
    }
    const w = WEAPONS[game.weapon];
    play(game.weapon ? "blast" : "shot");
    kick = 0.16;
    flash = 0.06;
    host.look.pitch = Math.min(1.2, host.look.pitch + (game.weapon ? 0.035 : 0.012));
    aim.setFromEuler(new Euler(host.look.pitch, host.look.yaw, 0, "YXZ"));
    const p = position(ctx.entity.id);
    eye.set(p.x, p.y + 0.55, p.z);
    for (let i = 0; i < w.pellets; i++) {
      const b = bullets.find((b) => !b.active);
      if (!b) break;
      b.active = true;
      b.life = 0.65;
      b.damage = w.damage;
      b.position.copy(eye);
      b.direction
        .set((random() - 0.5) * w.spread, (random() - 0.5) * w.spread, -1)
        .normalize()
        .applyQuaternion(aim);
      setVisible(b.id, true);
    }
  }
  return {
    start() {
      host.configureInput({ recoverKey: null, pointerLockOnClick: true, sensitivity: 0.0022 });
      for (const e of host.document.entities)
        if (
          e.physics?.type === "fixed" &&
          e.tag !== "ground" &&
          e.transform.position[1] - e.transform.scale[1] / 2 < 1.7
        )
          field.obstacle(
            e.transform.position[0],
            e.transform.position[2],
            e.transform.scale[0],
            e.transform.scale[2],
          );
      try {
        if (typeof localStorage !== "undefined")
          best = Number(localStorage.getItem("nightfall-best")) || 0;
      } catch {
        /* Optional persistence. */
      }
      ctx.ui.onAction("restart", reset);
      reset();
      play("wind");
      ctx.log("Nightfall ready: 160m map, 12 enemy slots, 32 projectile slots.");
    },
    fixedUpdate(dt: number) {
      elapsed += dt;
      hitTimer = Math.max(0, hitTimer - dt);
      hurtTimer = Math.max(0, hurtTimer - dt);
      noticeTimer = Math.max(0, noticeTimer - dt);
      if (!noticeTimer && !game.dead) ctx.ui.setText("notice", "");
      if (game.dead) {
        if (edge("Enter")) reset();
        previous.clear();
        for (const k of ctx.input) previous.add(k);
        return;
      }
      game.tick(dt);
      if (edge("Digit1")) game.switchTo(0);
      if (edge("Digit2")) game.switchTo(1);
      if (edge("KeyR") && game.reload()) play("reload");
      if (edge("KeyF")) setVisible("flashlight", !ctx.find("flashlight")!.enabled);
      let x = Number(ctx.input.has("KeyD")) - Number(ctx.input.has("KeyA")),
        z = Number(ctx.input.has("KeyS")) - Number(ctx.input.has("KeyW"));
      const moving = Math.hypot(x, z) > 0,
        n = Math.hypot(x, z) || 1;
      x /= n;
      z /= n;
      const sprint = moving && ctx.input.has("Shift") && game.stamina > 5 && !game.reloading;
      game.stamina = Math.max(0, Math.min(100, game.stamina + (sprint ? -24 : 16) * dt));
      const speed = sprint ? 6.8 : 3.8,
        yaw = host.look.yaw;
      if (physics.isGrounded(ctx.entity.id) && vertical < 0) vertical = 0;
      vertical = Math.max(-20, vertical - 18 * dt);
      physics.move(ctx.entity.id, {
        x: (x * Math.cos(yaw) + z * Math.sin(yaw)) * speed * dt,
        y: vertical * dt,
        z: (-x * Math.sin(yaw) + z * Math.cos(yaw)) * speed * dt,
      });
      host.jump = false;
      footstep -= dt;
      if (moving && footstep <= 0) {
        play("step");
        footstep = sprint ? 0.3 : 0.48;
      }
      const p = position(ctx.entity.id);
      if (p.y < -5) ctx.teleport([0, 1.05, 20]);
      pathTimer -= dt;
      if (pathTimer <= 0) {
        field.rebuild(p.x, p.z);
        pathTimer = 0.5;
      }
      if (intermission > 0) {
        intermission -= dt;
        if (intermission <= 0) {
          game.wave++;
          remaining = 5 + game.wave * 3;
          play("bell");
          showNotice(`WAVE ${game.wave}   /   THEY HAVE FOUND YOU`);
          ctx.emit("nightfall-wave", { wave: game.wave });
        }
      } else {
        spawnTimer -= dt;
        if (remaining > 0 && spawnTimer <= 0 && spawnEnemy()) {
          remaining--;
          spawnTimer = Math.max(0.5, 1.4 - game.wave * 0.05);
        }
        if (!remaining && !enemies.some((e) => e.active)) {
          intermission = 12;
          game.reserves[0] = Math.min(180, game.reserves[0] + 20);
          game.reserves[1] = Math.min(60, game.reserves[1] + 6);
          for (let i = 0; i < 4; i++) {
            caches[i] = true;
            setVisible("cache-" + i, true);
          }
          showNotice("A MOMENT OF SILENCE. RESUPPLY BEFORE THE NEXT WAVE.", 5);
        }
      }
      for (const e of enemies) {
        if (!e.active) {
          if (e.corpse > 0) {
            e.corpse -= dt;
            if (e.corpse <= 0) setVisible(e.id, false);
          }
          continue;
        }
        const q = position(e.id),
          distance = Math.hypot(q.x - p.x, q.z - p.z);
        e.cooldown = Math.max(0, e.cooldown - dt);
        if (e.attack > 0) {
          e.attack -= dt;
          if (e.attack <= 0) {
            if (
              distance < 2.1 &&
              clearShot(new Vector3(q.x, q.y + 0.2, q.z), new Vector3(p.x, p.y + 0.2, p.z), e.id)
            )
              hurt(e.variant ? 24 : 16);
            e.cooldown = 1.1;
            animate(e.id, "walk");
          }
          continue;
        }
        if (
          distance < 1.9 &&
          e.cooldown === 0 &&
          clearShot(new Vector3(q.x, q.y + 0.2, q.z), new Vector3(p.x, p.y + 0.2, p.z), e.id)
        ) {
          e.attack = 0.65;
          animate(e.id, "attack");
          play("growl", [q.x, q.y, q.z]);
          continue;
        }
        const [dx, dz] = field.direction(q.x, q.z, p.x, p.z);
        physics.move(e.id, { x: dx * e.speed * dt, y: -3 * dt, z: dz * e.speed * dt });
        physics.bodies
          .get(e.id)!
          .setNextKinematicRotation(
            new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-dx, -dz)),
          );
      }
      if (ctx.input.has("Mouse0")) shoot();
      for (const b of bullets) {
        if (!b.active) continue;
        const distance = 180 * dt,
          hit = cast(b.position, b.direction, distance, ctx.entity.id);
        b.life -= dt;
        if (hit) {
          b.position.addScaledVector(b.direction, hit.timeOfImpact);
          const id = physics.ids.get(hit.collider.handle),
            enemy = enemies.find((e) => e.active && e.id === id);
          if (enemy) {
            const head = b.position.y > position(enemy.id).y + 0.45;
            enemy.hp -= b.damage * (head ? 1.8 : 1);
            hitTimer = 0.18;
            if (enemy.hp <= 0) {
              enemy.active = false;
              enemy.corpse = 0.8;
              physics.bodies.get(enemy.id)!.setEnabled(false);
              animate(enemy.id, "death");
              game.kills++;
              game.score += head ? 150 : 100;
            }
          }
          const spark = impacts[impactIndex++ % impacts.length];
          spark.life = 0.15;
          ctx.objectFor(spark.id)!.position.copy(b.position);
          setVisible(spark.id, true);
          play("impact", b.position.toArray() as Vec3);
          b.life = 0;
        } else b.position.addScaledVector(b.direction, distance);
        const o = ctx.objectFor(b.id)!;
        o.position.copy(b.position);
        o.quaternion.setFromUnitVectors(axis, b.direction);
        if (b.life <= 0) {
          b.active = false;
          setVisible(b.id, false);
        }
      }
      for (const s of impacts)
        if (s.life > 0) {
          s.life -= dt;
          if (s.life <= 0) setVisible(s.id, false);
        }
      let near = -1;
      for (let i = 0; i < 4; i++) {
        const c = ctx.objectFor("cache-" + i)!;
        if (caches[i] && Math.hypot(c.position.x - p.x, c.position.z - p.z) < 2.5) near = i;
      }
      ctx.ui.setText(
        "hint",
        near >= 0
          ? "E / OPEN SUPPLIES — AMMO & FIRST AID"
          : "WASD move · Shift sprint · R reload · 1 / 2 switch · E supplies · F torch · Esc pause",
      );
      if (near >= 0 && edge("KeyE")) {
        caches[near] = false;
        setVisible("cache-" + near, false);
        game.supply();
        play("reload");
        showNotice("SUPPLIES RECOVERED", 2);
      }
      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.1;
        refresh();
      }
      previous.clear();
      for (const k of ctx.input) previous.add(k);
    },
    update(dt: number) {
      kick = Math.max(0, kick - dt);
      flash = Math.max(0, flash - dt);
      aim.setFromEuler(new Euler(host.look.pitch, host.look.yaw, 0, "YXZ"));
      eye.copy(ctx.object.position);
      eye.y += 0.55;
      const moving =
        ctx.input.has("KeyW") ||
        ctx.input.has("KeyS") ||
        ctx.input.has("KeyA") ||
        ctx.input.has("KeyD");
      for (let i = 0; i < 2; i++) {
        const o = ctx.objectFor("weapon-" + i)!;
        setVisible("weapon-" + i, i === game.weapon && !game.dead);
        offset
          .set(
            0.25,
            -0.22 + (moving ? Math.sin(elapsed * 10) * 0.012 : 0) - (game.reloading ? 0.13 : 0),
            -0.42 + kick * 0.6,
          )
          .applyQuaternion(aim);
        o.position.copy(eye).add(offset);
        o.quaternion
          .copy(aim)
          .multiply(
            new Quaternion().setFromEuler(
              new Euler(game.reloading ? 0.45 : kick * 0.6, 0, game.reloading ? -0.5 : 0),
            ),
          );
      }
      const torch = ctx.objectFor("flashlight")!;
      // A camera-mounted lamp uses actual surface lighting, not a cosmetic cone seen from inside.
      for (const child of torch.children) if (child.userData.volume) child.visible = false;
      torch.position.copy(eye).add(new Vector3(0, 0, -0.85).applyQuaternion(aim));
      torch.quaternion
        .copy(aim)
        .multiply(new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)));
      const muzzle = ctx.objectFor("muzzle")!;
      setVisible("muzzle", flash > 0 && !game.dead);
      forward.set(0.25, -0.19, game.weapon ? -0.99 : -0.75).applyQuaternion(aim);
      muzzle.position.copy(eye).add(forward);
      muzzle.quaternion
        .copy(aim)
        .multiply(new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)));
    },
    dispose() {
      host.configureInput(oldInput);
      host.audio.stopOwner("nightfall-spatial");
    },
  };
}
