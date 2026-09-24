import { createFileRoute } from "@tanstack/react-router";

import { rutaUsluge } from "../usluge-ruta";

export const Route = createFileRoute("/elektricar-podgorica")(rutaUsluge("/elektricar-podgorica"));
