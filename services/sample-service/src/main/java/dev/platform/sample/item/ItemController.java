package dev.platform.sample.item;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/items")
class ItemController {
    static final int DEFAULT_PAGE_SIZE = 50;
    static final int MAX_PAGE_SIZE = 200;

    private final ItemService service;

    ItemController(ItemService service) {
        this.service = service;
    }

    @GetMapping
    List<ItemResponse> findAll(
            @RequestParam(name = "page", defaultValue = "0") @Min(0) int page,
            @RequestParam(name = "size", defaultValue = "50") @Min(1) @Max(MAX_PAGE_SIZE) int size
    ) {
        return service.findAll(page, size);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ItemResponse create(@Valid @RequestBody CreateItemRequest request) {
        return service.create(request.name());
    }
}
