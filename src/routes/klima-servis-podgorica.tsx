import { createFileRoute } from "@tanstack/react-router";

import { rutaUsluge } from "../usluge-ruta";

export const Route = createFileRoute("/klima-servis-podgorica")(rutaUsluge("/klima-servis-podgorica"));
